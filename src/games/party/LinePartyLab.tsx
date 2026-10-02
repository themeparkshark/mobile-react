/**
 * LinePartyLab (dev builds only): runs Line Party on a simulator against a
 * local backend with a per-simulator QA account, so two simulators can race
 * each other for real. It does what LinePlay does in the product: starts a
 * geofenced LinePlay session at the ride and keeps it fresh with heartbeats.
 *
 * Settings (bundle-time, dev only, never committed):
 *   EXPO_PUBLIC_PARTY_LAB=1
 *   EXPO_PUBLIC_PARTY_LAB_ACCOUNTS  JSON {"<simulator name>": {"id":17,"token":"...","autoplay":"ace"}}
 *   EXPO_PUBLIC_PARTY_LAB_RIDE      "194,34.139487,-118.353919" (ride id, lat, lng)
 *   EXPO_PUBLIC_REVERB_KEY / _HOST / _PORT / _SCHEME
 * "autoplay" is optional demo hands (a human-paced bot) for recorded proof runs.
 */
import { useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import axios from 'axios';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import config from '../../config';
import SharkLoader from '../../ui/SharkLoader';
import { BRAND } from '../../ui/tokens';
import { PartyClient } from '../../gamekit/net/PartyClient';
import { createReverbSocket } from '../../gamekit/net/reverbSocket';
import LineParty from '../../gamekit/party/LineParty';
import { appReverbConfig } from '../../gamekit/party/createAppPartyClient';
import type { BotProfile } from './bonkRace';

interface LabAccount { id: number; token: string; autoplay?: BotProfile }

function labSettings() {
  let accounts: Record<string, LabAccount> = {};
  try { accounts = JSON.parse(process.env.EXPO_PUBLIC_PARTY_LAB_ACCOUNTS || '{}'); } catch { accounts = {}; }
  const [ride, lat, lng] = (process.env.EXPO_PUBLIC_PARTY_LAB_RIDE || '194,34.139487,-118.353919').split(',').map(Number);
  const name = Device.deviceName ?? '';
  const account = accounts[name] ?? Object.values(accounts)[0] ?? null;
  return { account, ride, lat, lng, name };
}

export default function LinePartyLab({ onClose }: { onClose: () => void }) {
  const settings = useMemo(labSettings, []);
  const [session, setSession] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const http = useMemo(() => settings.account ? axios.create({
    baseURL: config.apiUrl,
    timeout: 8000,
    headers: { Authorization: `Bearer ${settings.account.token}`, Accept: 'application/json', 'App-Version': '1.6.0' },
  }) : null, [settings.account]);

  // What LinePlay does in the product: a geofenced session at the ride, kept fresh.
  useEffect(() => {
    if (!http) { setError('No lab account for this simulator.'); return; }
    let cancelled = false;
    let id: string | null = null;
    const where = { latitude: settings.lat, longitude: settings.lng };
    http.post('/me/line-sessions', { client_request_id: `party-lab-${settings.account!.id}-${Date.now()}-abcdef`, ride_id: settings.ride, ...where })
      // A fresh geofenced sample right away, like LinePlay's own heartbeat.
      .then(({ data }) => { id = data.session_id; return http.post(`/me/line-sessions/${id}/heartbeat`, where); })
      .then(() => { if (!cancelled) setSession(id); })
      .catch((e) => !cancelled && setError(e?.response?.data?.message ?? 'Could not start LinePlay here.'));
    const beat = setInterval(() => { if (id) http.post(`/me/line-sessions/${id}/heartbeat`, where).catch(() => {}); }, 30000);
    return () => { cancelled = true; clearInterval(beat); };
  }, [http, settings]);

  const client = useMemo(() => {
    if (!http || !settings.account || !session) return null;
    const reverb = appReverbConfig();
    return new PartyClient({
      http,
      userId: settings.account.id,
      createSocket: reverb ? (authorize) => createReverbSocket(reverb, authorize) : undefined,
      storage: AsyncStorage,
      appState: AppState,
      log: (m, d) => console.log(`[party-lab ${settings.name}] ${m}`, d ?? ''),
    });
  }, [http, session, settings]);

  // Demo hands also work the lobby for recorded proof runs: a sticker, READY,
  // and REMATCH at human-ish moments. Only when autoplay is set for this simulator.
  useEffect(() => {
    if (!client || !settings.account?.autoplay) return;
    let last = '';
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const stickers = ['foam_finger', 'fin', 'sunglasses', 'treasure', 'coin'] as const;
    const pick = () => stickers[Math.floor(Math.random() * stickers.length)];
    const unsub = client.subscribe((st) => {
      const key = `${st.phase}:${st.room?.round?.id ?? ''}`;
      if (key === last) return;
      last = key;
      if (st.phase === 'lobby') {
        later(1800 + Math.random() * 1500, () => void client.emote(pick()));
        later(4200 + Math.random() * 2500, () => void client.ready(true));
      }
      if (st.phase === 'results') {
        later(1600 + Math.random() * 1200, () => void client.emote(pick()));
        later(5000 + Math.random() * 2500, () => void client.rematch());
      }
    });
    return () => { unsub(); timers.forEach(clearTimeout); };
  }, [client, settings.account?.autoplay]);

  if (!client) {
    return (
      <View style={styles.fill}>
        <SharkLoader tone="onBlue" state={error ? 'error' : 'loading'} title={error ? 'Lab not ready' : 'Joining the line'} message={error ?? 'Starting LinePlay at the ride.'} />
      </View>
    );
  }
  return <LineParty client={client} rideId={settings.ride} onExit={onClose} autoplay={settings.account?.autoplay ?? null} />;
}

const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: BRAND.blue } });
