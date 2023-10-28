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
      s: '1 minute ago',
      m: '1 minute ago',
      mm: '%d minutes ago',
      h: '1 hour ago',
      hh: '%d hours ago',
      d: '1 day ago',
      dd: '%d days ago',
      M: '1 month ago',
      MM: '%d months ago',
      y: '1 year ago',
      yy: '%d years ago',
    },
  });

  return dayjs(args);
}
