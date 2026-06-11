import type { Logger } from "pino";
import type { Database } from "../db/database";
import { getTenantConfig, updateTenantConfig, getUserById, type DbTenantConfig } from "../db/database";
import { AdminService, createAdminCommands } from "../commands/adminCommands";
import { createEmergencyStopCommand } from "../commands/emergencyStopCommand";
import { createGreenScreenCommand } from "../commands/greenScreenCommand";
import { CommandRouter } from "../commands/commandRouter";
import { ApprovalService } from "../approval/approvalService";
import { BlacklistService } from "../blacklist/blacklistService";
import { HistoryService } from "../history/historyService";
import { CooldownService } from "../cooldown/cooldownService";
import { PermissionService } from "../permissions/permissionService";
import { UrlValidator } from "../validation/urlValidator";
import { OverlayBroadcaster } from "../overlay/overlayBroadcaster";
import { PlaybackQueue } from "../queue/playbackQueue";
import { TwitchBotManager } from "../twitch/twitchBotManager";
import { MockObsSourceController } from "../obs/mockObsSourceController";
import { createRuntimeState } from "../state/runtimeState";
import { searchShortVideo } from "../media/youtubeSearch";
import { searchGif } from "../media/klipySearch";

// The mutable runtime config that all tenant services share via reference
export interface TenantRuntimeConfig {
  access: { subOnly: boolean; modOnly: boolean };
  cooldown: { enabled: boolean; seconds: number; perUserEnabled: boolean; perUserSeconds: number };
  approval: { enabled: boolean; timeoutSeconds: number };
  queue: { mode: "queue" | "replace" | "drop"; maxSize: number };
  playback: { durationSeconds: number; chatFeedback: boolean };
  validation: {
    allowedDomains: string[];
    allowDirectFiles: boolean;
    allowedFileExtensions: string[];
    maxDurationSeconds: number;
  };
  commands: { gs: string; stop: string };
}

export interface TenantServices {
  runtimeConfig: TenantRuntimeConfig;
  queue: PlaybackQueue;
  cooldownService: CooldownService;
  approvalService: ApprovalService;
  blacklistService: BlacklistService;
  historyService: HistoryService;
  overlayBroadcaster: OverlayBroadcaster;
  twitchBotManager: TwitchBotManager;
  router: CommandRouter;
}

function dbConfigToRuntime(row: DbTenantConfig): TenantRuntimeConfig {
  return {
    access: { subOnly: Boolean(row.sub_only), modOnly: Boolean(row.mod_only) },
    cooldown: {
      enabled: Boolean(row.cooldown_enabled),
      seconds: row.cooldown_seconds,
      perUserEnabled: Boolean(row.cooldown_per_user),
      perUserSeconds: row.cooldown_per_user_seconds
    },
    approval: { enabled: Boolean(row.approval_enabled), timeoutSeconds: row.approval_timeout_seconds },
    queue: { mode: row.queue_mode as "queue" | "replace" | "drop", maxSize: row.queue_max_size },
    playback: { durationSeconds: row.duration_seconds, chatFeedback: Boolean(row.chat_feedback) },
    validation: {
      allowedDomains: row.allowed_domains.split(",").map((d) => d.trim()).filter(Boolean),
      allowDirectFiles: Boolean(row.allow_direct_files),
      allowedFileExtensions: row.allowed_file_extensions.split(",").map((e) => e.trim()).filter(Boolean),
      maxDurationSeconds: row.max_video_duration_seconds
    },
    commands: { gs: "!gs", stop: "!gstop" }
  };
}

export class TenantManager {
  private readonly tenants = new Map<number, TenantServices>();

  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly youtubeApiKey?: string,
    private readonly klipyApiKey?: string
  ) {}

  getOrCreate(userId: number): TenantServices {
    const existing = this.tenants.get(userId);
    if (existing) return existing;

    const dbConfig = getTenantConfig(this.db, userId);
    const runtimeConfig = dbConfigToRuntime(dbConfig);

    const overlayBroadcaster = new OverlayBroadcaster();
    const obsController = new MockObsSourceController(createRuntimeState(), this.logger);

    const queue = new PlaybackQueue(
      obsController,
      runtimeConfig.queue,
      this.logger,
      (event) => overlayBroadcaster.broadcast(event)
    );

    const permissionService = new PermissionService();
    const cooldownService = new CooldownService();
    const urlValidator = new UrlValidator();
    const blacklistService = new BlacklistService(this.db, userId);
    const historyService = new HistoryService(this.db, userId);
    const approvalService = new ApprovalService({ queue, config: runtimeConfig.approval, logger: this.logger });
    const adminService = new AdminService({
      runtimeConfig,
      cooldownService,
      blacklistService,
      historyService,
      approvalService,
      logger: this.logger
    });

    const commandDeps = {
      permissionService,
      cooldownService,
      urlValidator,
      queue,
      blacklistService,
      historyService,
      youtubeDurationValidator: undefined,
      youtubeSearch: this.youtubeApiKey
        ? (query: string, maxDuration: number) => searchShortVideo(query, maxDuration, this.youtubeApiKey!)
        : undefined,
      gifSearch: this.klipyApiKey
        ? (query: string) => searchGif(query, this.klipyApiKey!)
        : undefined,
      approvalService,
      adminService,
      config: runtimeConfig,
      logger: this.logger
    };

    const router = new CommandRouter([
      createGreenScreenCommand(commandDeps, runtimeConfig.commands.gs),
      createEmergencyStopCommand(commandDeps, runtimeConfig.commands.stop),
      ...createAdminCommands()
    ]);

    const twitchBotManager = new TwitchBotManager(router, this.logger);

    // Auto-reconnect on startup / after redeploy using stored credentials
    const dbUser = getUserById(this.db, userId);
    if (dbUser?.access_token && dbUser?.twitch_login) {
      twitchBotManager.start({
        channel: dbUser.twitch_login,
        botUsername: dbUser.twitch_login,
        oauthToken: dbUser.access_token
      }).catch((err) => this.logger.error({ err, userId }, "Failed to auto-start Twitch bot"));
    }

    const services: TenantServices = {
      runtimeConfig,
      queue,
      cooldownService,
      approvalService,
      blacklistService,
      historyService,
      overlayBroadcaster,
      twitchBotManager,
      router
    };

    this.tenants.set(userId, services);
    this.logger.info({ userId }, "Tenant services created");
    return services;
  }

  get(userId: number): TenantServices | undefined {
    return this.tenants.get(userId);
  }

  async stop(userId: number): Promise<void> {
    const tenant = this.tenants.get(userId);
    if (!tenant) return;
    await tenant.twitchBotManager.stop();
    await tenant.queue.stop();
    this.tenants.delete(userId);
    this.logger.info({ userId }, "Tenant services stopped");
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.tenants.keys()].map((id) => this.stop(id)));
  }

  // Persist config change to DB and update in-memory reference
  persistConfig(userId: number, patch: Partial<DbTenantConfig>): void {
    updateTenantConfig(this.db, userId, patch);
    const tenant = this.tenants.get(userId);
    if (!tenant) return;
    const updated = dbConfigToRuntime(getTenantConfig(this.db, userId));
    Object.assign(tenant.runtimeConfig.access, updated.access);
    Object.assign(tenant.runtimeConfig.cooldown, updated.cooldown);
    Object.assign(tenant.runtimeConfig.approval, updated.approval);
    Object.assign(tenant.runtimeConfig.queue, updated.queue);
    Object.assign(tenant.runtimeConfig.playback, updated.playback);
    Object.assign(tenant.runtimeConfig.validation, updated.validation);
  }
}
