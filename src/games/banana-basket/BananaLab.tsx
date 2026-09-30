/**
 * BananaLab (dev only): pick a Banana Basket mode to play or watch.
 *
 * Boot straight into it with EXPO_PUBLIC_RIDE_GAME_PREVIEW=1 and
 * EXPO_PUBLIC_BANANA_LAB=menu (or ride, queue, ride-bot, queue-bot,
 * finn, ride-fresh). "fresh" clears the saved Banana progress first so the
 * teaching cards and the queue unlock gate replay from run 1.
 */

import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BananaBasketGame } from './BananaBasketGame';
import { PROGRESS_KEY } from './constants';

type LabMode = { mode: 'ride' | 'queue'; difficulty: 1 | 2 | 3; autoplay: boolean; finn: boolean; deck: string };

function parse(cmd: string): LabMode | null {
  const c = cmd.toLowerCase();
  if (!c || c === 'menu' || c === '1') return null;
  return {
    mode: c.includes('queue') ? 'queue' : 'ride',
    difficulty: c.includes('d1') ? 1 : c.includes('d3') ? 3 : 2,
    autoplay: c.includes('bot'),
    finn: c.includes('finn'),
    deck: c.includes('ocean') ? 'ocean' : 'park',
  };
}

export default function BananaLab({ command, onClose }: { command: string; onClose: () => void }) {
  const [ready, setReady] = useState(!command.includes('fresh'));
  const [run, setRun] = useState<LabMode | null>(parse(command));
  const [n, setN] = useState(0);
  const [last, setLast] = useState('');

  useEffect(() => {
    if (!command.includes('fresh')) return;
    AsyncStorage.removeItem(PROGRESS_KEY).catch(() => undefined).finally(() => setReady(true));
  }, [command]);

  if (!ready) return <View style={styles.root} />;
  if (run) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <BananaBasketGame
          key={n}
          visible
          mode={run.mode}
          difficulty={run.difficulty}
          deck={run.deck}
          autoplay={run.autoplay}
          staffGhost={run.finn}
          seed={20260930 + n}
          onComplete={(mult, meta) => {
            const m = meta as { score?: number; verifiedLocally?: boolean } | undefined;
            setLast(`Done x${mult}  score ${m?.score ?? '?'}  replay ${m?.verifiedLocally ? 'OK' : 'MISMATCH'}`);
            setRun(null);
          }}
          onClose={() => setRun(null)}
        />
      </View>
    );
  }
  const Item = ({ label, m }: { label: string; m: LabMode }) => (
    <TouchableOpacity style={styles.item} onPress={() => { setN((k) => k + 1); setRun(m); }}>
      <Text style={styles.itemText}>{label}</Text>
    </TouchableOpacity>
  );
  const base: LabMode = { mode: 'ride', difficulty: 2, autoplay: false, finn: false, deck: 'park' };
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Image source={require('../../assets/games/banana-basket/v2/shark_hold.png')} style={styles.hero} resizeMode="contain" />
        <Text style={styles.title}>BANANA LAB</Text>
        {last ? <Text style={styles.last}>{last}</Text> : null}
        <Item label="Ride Challenge (d2)" m={base} />
        <Item label="Ride Challenge (d1)" m={{ ...base, difficulty: 1 }} />
        <Item label="Ride Challenge (d3)" m={{ ...base, difficulty: 3 }} />
        <Item label="Queue run" m={{ ...base, mode: 'queue' }} />
        <Item label="Queue run, water deck" m={{ ...base, mode: 'queue', deck: 'ocean' }} />
        <Item label="Ride vs staff ghost Finn" m={{ ...base, finn: true }} />
        <Item label="Bot plays Ride" m={{ ...base, autoplay: true }} />
        <Item label="Bot plays Queue" m={{ ...base, mode: 'queue', autoplay: true }} />
        <TouchableOpacity style={[styles.item, styles.reset]} onPress={() => { AsyncStorage.removeItem(PROGRESS_KEY).catch(() => undefined); setLast('Progress reset'); }}>
          <Text style={styles.itemText}>Reset Banana progress</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.item, styles.close]} onPress={onClose}>
          <Text style={styles.itemText}>Close</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#bfeaff', zIndex: 50 },
  content: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 60, alignItems: 'stretch' },
  hero: { width: 120, height: 140, alignSelf: 'center' },
  title: { fontFamily: 'Shark', fontSize: 34, color: '#23263a', textAlign: 'center', marginBottom: 10 },
  last: { fontFamily: 'Knockout', fontSize: 16, color: '#0768b9', textAlign: 'center', marginBottom: 10 },
  item: { backgroundColor: '#fff8e4', borderRadius: 16, borderWidth: 3, borderColor: '#23263a', paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 },
  itemText: { fontFamily: 'Shark', fontSize: 20, color: '#23263a' },
  reset: { backgroundColor: '#ffe3de' },
  close: { backgroundColor: '#ffffff' },
});
