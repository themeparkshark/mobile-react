import dayjs from 'dayjs';

export default function customDayJs(args) {
  dayjs.extend(require('dayjs/plugin/relativeTime'));
  dayjs.extend(require('dayjs/plugin/updateLocale'));
  dayjs.extend(require('dayjs/plugin/localizedFormat'));
  dayjs.extend(require('dayjs/plugin/utc'));
  dayjs.extend(require('dayjs/plugin/timezone'));

  dayjs.updateLocale('en', {
    relativeTime: {
      future: 'in %s',
      past: '%s',
      s: '1m',
      m: '1m',
      mm: '%dm',
      h: '1h',
      hh: '%dh',
      d: '1d',
      dd: '%dd',
      M: '1m',
      MM: '%dm',
      y: '1y',
      yy: '%dy',
    },
  });

  return dayjs(args).tz('America/New_York');
}
