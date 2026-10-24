/** QR codes for share pictures outside the Share Studio kinds (tools/share-studio/build-campaign-qr.cjs). Do not edit by hand. */
export type ShareCampaign = 'invite' | 'crew' | 'ride_log' | 'whack' | 'memory' | 'look' | 'sharkpass' | 'member';

export const QR_BY_CAMPAIGN: Readonly<Record<ShareCampaign, number>> = {
  invite: require('../../assets/images/share/qr/campaign-invite.png'),
  crew: require('../../assets/images/share/qr/campaign-crew.png'),
  ride_log: require('../../assets/images/share/qr/campaign-ride_log.png'),
  whack: require('../../assets/images/share/qr/campaign-whack.png'),
  memory: require('../../assets/images/share/qr/campaign-memory.png'),
  look: require('../../assets/images/share/qr/campaign-look.png'),
  sharkpass: require('../../assets/images/share/qr/campaign-sharkpass.png'),
  member: require('../../assets/images/share/qr/campaign-member.png'),
};
