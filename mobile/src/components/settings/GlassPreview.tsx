import { BackdropBlur, Blur, Canvas, Circle, Fill, Group, LinearGradient, Paint, RoundedRect, rect, rrect, useClock, vec } from '@shopify/react-native-skia';
import { memo, useState } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';
import { glassLevel, material } from '@/lib/glass';
import { useColors } from '@/theme';

const H = 176;

/**
 * Live preview for the glass slider, drawn with Skia so the blur is real on
 * every Android version: drifting colour shapes behind a floating glass card
 * (backdrop blur → material tint → glow → sheen → rim). Every layer is driven
 * by the same `material(level)` the app's chrome uses, straight from the
 * shared value, so it moves in lockstep with your finger.
 */
export const GlassPreview = memo(function GlassPreview() {
  const colors = useColors();
  const [w, setW] = useState(0);
  const clock = useClock();
  const reduceMotion = useReducedMotion();
  const dark = colors.scheme === 'dark';

  const cw = Math.min(w - 48, 300);
  const ch = 96;
  const cx = (w - cw) / 2;
  const cy = (H - ch) / 2;
  const card = rrect(rect(cx, cy, cw, ch), 30, 30);

  const t = useDerivedValue(() => (reduceMotion ? 4000 : clock.value));
  const aX = useDerivedValue(() => w * 0.28 + Math.sin(t.value / 1900) * w * 0.16);
  const aY = useDerivedValue(() => H * 0.38 + Math.cos(t.value / 2300) * 26);
  const bX = useDerivedValue(() => w * 0.7 + Math.cos(t.value / 2100) * w * 0.14);
  const bY = useDerivedValue(() => H * 0.62 + Math.sin(t.value / 1700) * 24);
  const cX = useDerivedValue(() => w * 0.5 + Math.sin(t.value / 2700 + 1) * w * 0.3);
  const stripes = useDerivedValue(() => [{ translateX: ((t.value / 40) % 56) - 56 }, { rotate: -0.5 }]);

  // 6 px of blur as clear liquid glass, ~20 px once frosted (same curve as the chrome's intensity).
  const blur = useDerivedValue(() => 6 + 14 * ((material(glassLevel.value, true).blur - 0.85) / 0.9));
  const tint = useDerivedValue(() => material(glassLevel.value, true).tint);
  const sheen = useDerivedValue(() => material(glassLevel.value, true).sheen);
  const glow = useDerivedValue(() => material(glassLevel.value, true).glow);
  const rim = useDerivedValue(() => material(glassLevel.value, true).rim);

  return (
    <View style={{ height: H, borderRadius: 22, overflow: 'hidden' }} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {w > 0 ? (
        <Canvas style={{ width: w, height: H }}>
          <Fill color={dark ? '#0E0E14' : '#EEF0F6'} />
          {/* content behind the glass */}
          <Group transform={stripes} origin={vec(w / 2, H / 2)}>
            {Array.from({ length: Math.ceil((w + 260) / 28) }).map((_, i) => (
              <RoundedRect key={i} x={i * 28 - 130} y={-60} width={9} height={H + 120} r={4.5} color={dark ? 'rgba(255,255,255,0.10)' : 'rgba(10,10,30,0.08)'} />
            ))}
          </Group>
          <Group layer={<Paint><Blur blur={1.5} /></Paint>}>
            <Circle cx={aX} cy={aY} r={44} color="#FF5A36" />
            <Circle cx={bX} cy={bY} r={50} color="#2E7CF6" />
            <Circle cx={cX} cy={H * 0.24} r={26} color="#F6D68A" />
            <Circle cx={w * 0.86} cy={H * 0.2} r={18} color="#3DDC97" />
          </Group>

          {/* the glass card */}
          <BackdropBlur blur={blur} clip={card}>
            <RoundedRect rect={card} color={colors.glassBase} opacity={tint} />
          </BackdropBlur>
          <RoundedRect rect={card} opacity={glow}>
            <LinearGradient start={vec(0, cy + ch * 0.5)} end={vec(0, cy + ch)} colors={dark ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.10)'] : ['rgba(255,255,255,0)', 'rgba(255,255,255,0.5)']} />
          </RoundedRect>
          <RoundedRect rect={card} opacity={sheen}>
            <LinearGradient start={vec(0, cy)} end={vec(0, cy + ch * 0.7)} colors={dark ? ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']} />
          </RoundedRect>
          <RoundedRect rect={card} style="stroke" strokeWidth={1.2} opacity={rim}>
            <LinearGradient start={vec(0, cy)} end={vec(0, cy + ch)} colors={dark ? ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.06)'] : ['rgba(255,255,255,0.95)', 'rgba(10,10,30,0.10)']} />
          </RoundedRect>

          {/* mock content: artwork + two lines of text, to judge legibility */}
          <RoundedRect x={cx + 16} y={cy + 18} width={60} height={60} r={12}>
            <LinearGradient start={vec(cx + 16, cy + 18)} end={vec(cx + 76, cy + 78)} colors={['#FF5A36', '#FF2D6B', '#2E7CF6']} />
          </RoundedRect>
          <RoundedRect x={cx + 90} y={cy + 30} width={cw * 0.46} height={11} r={5.5} color={colors.text} />
          <RoundedRect x={cx + 90} y={cy + 52} width={cw * 0.3} height={9} r={4.5} color={colors.textSecondary} />
        </Canvas>
      ) : null}
    </View>
  );
});
