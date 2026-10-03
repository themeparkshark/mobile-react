/**
 * Development-only Share Studio gallery.
 *   EXPO_PUBLIC_SHARE_STUDIO_PREVIEW=1   every kind, tap to open the sheet or the Flex moment
 *   EXPO_PUBLIC_SHARE_STUDIO_RENDER=1    renders every sample in both formats and logs
 *                                        "SHARE_RENDER <name> <file>" for the r1 sheet
 *   EXPO_PUBLIC_SHARE_STUDIO_OPEN=<sample>:<sheet|reveal>  opens one straight away
 */
import { useEffect, useRef, useState } from 'react';
import { PixelRatio, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { FLEX_EXPORT, FLEX_SIZE, FlexCard, flexReveal, shareFlex, type FlexFormat } from '../share';
import { FLEX_SAMPLES, SAMPLE_INVENTORY, type FlexSample } from '../share/samples';
import { ArtReadinessProvider } from '../share/FlexArtwork';
import { Outlined } from '../share/Outlined';

const RENDER = process.env.EXPO_PUBLIC_SHARE_STUDIO_RENDER === '1';
const PROBE = process.env.EXPO_PUBLIC_SHARE_STUDIO_RENDER === 'probe';
const OPEN = process.env.EXPO_PUBLIC_SHARE_STUDIO_OPEN ?? '';

function open(sample: FlexSample, mode: 'sheet' | 'reveal', format: FlexFormat = 'story') {
  const payload = { ...sample.payload, inventory: SAMPLE_INVENTORY } as typeof sample.payload;
  if (mode === 'reveal') flexReveal(sample.kind, payload, { surface: 'dev' });
  else shareFlex(sample.kind, payload, { surface: 'dev', format });
}

export default function ShareStudioPreviewScreen() {
  useEffect(() => {
    if (!OPEN) return;
    const [name, mode, format] = OPEN.split(':');
    const sample = FLEX_SAMPLES.find(item => item.name === name);
    if (sample) setTimeout(() => open(sample, mode === 'reveal' ? 'reveal' : 'sheet', format === 'square' ? 'square' : 'story'), 5000);
  }, []);
  if (RENDER) return <RenderAll />;
  if (PROBE) return <RenderProbes />;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Share Studio</Text>
      {FLEX_SAMPLES.map(sample => (
        <View key={sample.name} style={styles.row}>
          <View style={{ width: 360 * 0.32, height: 640 * 0.32, overflow: 'hidden', borderRadius: 8 }}>
            <View style={{ width: 360, height: 640, transform: [{ scale: 0.32 }], transformOrigin: 'top left' }}>
              <FlexCard kind={sample.kind} payload={sample.payload} format="story" inventory={SAMPLE_INVENTORY} />
            </View>
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={styles.name}>{sample.name}</Text>
            <Pressable onPress={() => open(sample, 'reveal')}><Text style={styles.action}>Flex moment</Text></Pressable>
            <Pressable onPress={() => open(sample, 'sheet')}><Text style={styles.action}>Share sheet</Text></Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/** Renders each sample x format in turn, captures a PNG at export size and logs its path. */
function RenderAll() {
  const only = process.env.EXPO_PUBLIC_SHARE_STUDIO_ONLY;
  const jobs = FLEX_SAMPLES.filter(sample => !only || only.split(',').includes(sample.name))
    .flatMap(sample => (['story', 'square'] as const).map(format => ({ sample, format })));
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const ref = useRef<View>(null);
  const job = jobs[index];

  useEffect(() => {
    if (!job || !ready) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const scale = PixelRatio.get();
        const px = FLEX_EXPORT[job.format];
        const uri = await captureRef(ref, { format: 'png', result: 'tmpfile', width: px.width / scale, height: px.height / scale });
        console.log(`SHARE_RENDER ${job.sample.name}-${job.format} ${uri}`);
      } catch (error) {
        console.log(`SHARE_RENDER_FAIL ${job.sample.name}-${job.format} ${String(error)}`);
      }
      if (!cancelled) { setReady(false); setIndex(i => i + 1); }
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [job, ready]);

  useEffect(() => { if (index >= jobs.length) console.log('SHARE_RENDER_DONE'); }, [index, jobs.length]);
  if (!job) return <View style={styles.root}><Text style={styles.h1}>Done</Text></View>;
  return (
    <View style={[styles.root, { alignItems: 'flex-start' }]}>
      <FlexCard key={`${job.sample.name}-${job.format}`} ref={ref} kind={job.sample.kind} payload={job.sample.payload}
        format={job.format} inventory={SAMPLE_INVENTORY} onReadyChange={setReady} />
      <Text style={styles.name}>{index + 1}/{jobs.length} {job.sample.name} {job.format} {FLEX_SIZE[job.format].width}</Text>
    </View>
  );
}

/**
 * Outline pixel probes: every big number the cards print, white fill with a
 * magenta outline on flat navy, at a roomy size and squeezed into a narrow box.
 * tools/share-studio/outline-pixel-check.cjs fails on ghost copies or smears.
 */
export const OUTLINE_PROBES = ['6', '7', '37', '12/12', 'LV 7', 'LV 10', '#2', 'TOP 10%'];
function RenderProbes() {
  const jobs = OUTLINE_PROBES.flatMap(text => [{ text, box: 150, size: 36 }, { text, box: 70, size: 36 }]);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const ref = useRef<View>(null);
  const job = jobs[index];
  useEffect(() => {
    if (!job || !ready) return;
    const t = setTimeout(async () => {
      const uri = await captureRef(ref, { format: 'png', result: 'tmpfile' });
      console.log(`SHARE_PROBE ${index}-${job.box}-${encodeURIComponent(job.text)} ${uri}`);
      setReady(false); setIndex(i => i + 1);
    }, 300);
    return () => clearTimeout(t);
  }, [job, ready, index]);
  useEffect(() => { if (index >= jobs.length) console.log('SHARE_PROBE_DONE'); }, [index, jobs.length]);
  if (!job) return <View style={styles.root} />;
  return (
    <View style={[styles.root, { alignItems: 'flex-start' }]}>
      <ArtReadinessProvider key={index} onReadyChange={setReady}>
        <View ref={ref} collapsable={false} style={{ width: job.box + 24, padding: 12, backgroundColor: '#000080', alignItems: 'flex-start' }}>
          <View style={{ width: job.box, alignItems: 'center' }}>
            <Outlined text={job.text} outline="#ff00ff" style={{ fontFamily: 'Shark', fontSize: job.size, color: '#ffffff' }} />
          </View>
        </View>
      </ArtReadinessProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#a9e4ff', paddingTop: 60 },
  content: { padding: 16, paddingBottom: 100, gap: 14 },
  h1: { fontFamily: 'Shark', fontSize: 28, color: '#05346e' },
  row: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  name: { fontFamily: 'Shark', fontSize: 18, color: '#05346e' },
  action: { fontFamily: 'Knockout', fontSize: 16, color: '#075b9b', paddingVertical: 6 },
});
