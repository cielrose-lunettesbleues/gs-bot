export interface TwitchUserInfo {
  id: string;
  login: string;
  displayName: string;
}

export function buildTwitchAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "token",
    scope: "chat:read chat:edit channel:read:redemptions"
  });
  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

export async function fetchTwitchUserInfo(
  accessToken: string,
  clientId: string
): Promise<TwitchUserInfo> {
  const res = await fetch("https://api.twitch.tv/helix/users", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId
    }
  });
  if (!res.ok) throw new Error(`Twitch API returned ${res.status}`);
  const json = await res.json() as {
    data: Array<{ id: string; login: string; display_name: string }>;
  };
  const user = json.data[0];
  if (!user) throw new Error("No user data returned by Twitch API");
  return { id: user.id, login: user.login, displayName: user.display_name };
}
