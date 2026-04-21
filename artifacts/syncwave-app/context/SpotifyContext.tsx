import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "user-read-email",
  "user-read-private",
];
const STORAGE_KEY = "syncwave_spotify_token";
const STORAGE_EXPIRY_KEY = "syncwave_spotify_token_expiry";
const STORAGE_REFRESH_KEY = "syncwave_spotify_refresh_token";

const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

interface SpotifyContextValue {
  spotifyToken: string | null;
  isAuthing: boolean;
  authError: string | null;
  redirectUri: string;
  login: () => Promise<void>;
  logout: () => void;
}

const SpotifyContext = createContext<SpotifyContextValue | null>(null);

export function SpotifyProvider({ children }: { children: React.ReactNode }) {
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);
  const [isAuthing, setIsAuthing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "syncwave-app",
    path: "spotify",
  });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      responseType: AuthSession.ResponseType.Code,
      clientId: CLIENT_ID,
      scopes: SCOPES,
      usePKCE: true,
      redirectUri,
    },
    discovery,
  );

  useEffect(() => {
    const loadToken = async () => {
      try {
        const token = await AsyncStorage.getItem(STORAGE_KEY);
        const expiry = await AsyncStorage.getItem(STORAGE_EXPIRY_KEY);
        if (token && expiry && Date.now() < parseInt(expiry, 10)) {
          setSpotifyToken(token);
        }
      } catch {}
    };
    loadToken();
  }, []);

  useEffect(() => {
    if (response?.type !== "success") {
      if (response?.type === "error") {
        setAuthError("Spotify auth failed. Check your redirect URI is registered.");
        setIsAuthing(false);
      }
      return;
    }
    const code = response.params.code;
    const verifier = request?.codeVerifier;
    if (!code || !verifier) return;

    const exchangeToken = async () => {
      try {
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: CLIENT_ID,
          code_verifier: verifier,
        });
        const res = await fetch(discovery.tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        const data = await res.json();
        if (data.access_token) {
          const expiry = Date.now() + data.expires_in * 1000;
          await AsyncStorage.setItem(STORAGE_KEY, data.access_token);
          await AsyncStorage.setItem(STORAGE_EXPIRY_KEY, expiry.toString());
          if (data.refresh_token) {
            await AsyncStorage.setItem(STORAGE_REFRESH_KEY, data.refresh_token);
          }
          setSpotifyToken(data.access_token);
          setAuthError(null);
        } else {
          setAuthError(data.error_description ?? "Token exchange failed");
        }
      } catch {
        setAuthError("Network error during auth");
      } finally {
        setIsAuthing(false);
      }
    };
    exchangeToken();
  }, [response, request, redirectUri]);

  const login = useCallback(async () => {
    if (!CLIENT_ID) {
      setAuthError("Spotify Client ID not configured");
      return;
    }
    setIsAuthing(true);
    setAuthError(null);
    await promptAsync();
  }, [promptAsync]);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([STORAGE_KEY, STORAGE_EXPIRY_KEY, STORAGE_REFRESH_KEY]);
    setSpotifyToken(null);
  }, []);

  return (
    <SpotifyContext.Provider value={{ spotifyToken, isAuthing, authError, redirectUri, login, logout }}>
      {children}
    </SpotifyContext.Provider>
  );
}

export function useSpotify() {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error("useSpotify must be used within SpotifyProvider");
  return ctx;
}
