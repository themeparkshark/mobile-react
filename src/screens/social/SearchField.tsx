import { memo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import GameIcon from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import { INK } from './SocialKit';

/** A chunky white search field with Alex's magnifier and a big clear button. */
function SearchField({ placeholder, onChangeText, accessibilityLabel }: {
  readonly placeholder: string;
  readonly onChangeText: (text: string) => void;
  readonly accessibilityLabel: string;
}) {
  const input = useRef<TextInput>(null);
  const [value, setValue] = useState('');
  const change = (text: string) => { setValue(text); onChangeText(text); };
  return (
    <View style={styles.field}>
      <GameIcon name="search" size={26} />
      <TextInput
        ref={input}
        value={value}
        onChangeText={change}
        placeholder={placeholder}
        placeholderTextColor="#7C93B3"
        style={styles.input}
        maxLength={20}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel={accessibilityLabel}
        maxFontSizeMultiplier={1.3}
      />
      {value.length > 0 && (
        <Pressable onPress={() => { change(''); input.current?.focus(); }} hitSlop={10} style={styles.clear}
          accessibilityRole="button" accessibilityLabel="Clear search">
          <GameIcon name="close" size={24} />
        </Pressable>
      )}
    </View>
  );
}

export default memo(SearchField);

const styles = StyleSheet.create({
  field: {
    marginHorizontal: 14, marginBottom: 6, height: 54, borderRadius: 999, borderWidth: 3, borderBottomWidth: 5,
    borderColor: INK, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, gap: 8,
  },
  input: { flex: 1, height: '100%', fontFamily: FONT.body, fontSize: 19, color: BRAND.navy },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
