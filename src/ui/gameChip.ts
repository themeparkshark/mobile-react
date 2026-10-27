import { StyleSheet } from 'react-native';

/**
 * The app's one chip: white with a sky outline, gold with a brown lip when picked, navy
 * Knockout text. Wait Times set the look; Ride History and other filter rows reuse it so a
 * picked chip looks the same on every screen (no cyan web pills).
 */
export const GAME_CHIP = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#abd9f1',
  },
  chipSelected: {
    backgroundColor: '#ffcf3e',
    borderColor: '#bc7f0b',
  },
  text: {
    fontSize: 13,
    color: '#0a598f',
    fontFamily: 'Knockout',
  },
  textSelected: {
    color: '#063e72',
  },
});
