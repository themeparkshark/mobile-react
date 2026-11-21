#!/usr/bin/env python3
"""
Ride Parts ship gate, the app half (BUILD_LIST P25, PLAN section 7). Drives one lane simulator through the real
screens and checks the scratch server's rows. Nothing here touches production: it reads the scratch database
tps_polish_1023 and drives only the lane named on the command line through polish-2026-10-23/bin/lane.sh.

Per park it checks, from the park shelf (the door bug 9 broke):
  * queue rides: GPS at the ride, open the shelf, tap the ride's coin, tap LINEPLAY; the server opens a line on
    that coin's own ride (rides.task_id), whatever the coin and the ride are called. With --wait it then keeps the
    phone in line until the server pays 1 Part (10 real minutes) and screenshots the wait.
  * shows and landmarks: the coin card offers no LINEPLAY.
Wait Times rows (the feed id path, a holiday name such as "Jingle Cruise") are checked with --wait-times NAME.

Usage (dev JS; the lane's Metro must be up and signed in as the player):
  parts-gate.py --lane ds-atlas --player-id 99 --park 8 --rides 2 --shows 1 --out <evidence dir> [--wait]
Prints one JSON line per check and exits 1 when any check fails.
"""
import argparse
import json
import re
import subprocess
import sys
import time

P = '/Users/dustinsparage/apps/tps-prime-time-audit/polish-2026-10-23'
LANE_SH = f'{P}/bin/lane.sh'
QUEUE = ('attraction', 'coaster', 'dark_ride', 'flat_ride', 'water_ride')


def sh(*args, check=True):
    out = subprocess.run(list(args), capture_output=True, text=True, timeout=180)
    if check and out.returncode != 0:
        raise RuntimeError(f'{args[:3]} failed: {out.stderr.strip()[:200]}')
    return out.stdout


def sql(query):
    return [row.split('|') for row in sh('psql', '-h', '127.0.0.1', '-d', 'tps_polish_1023', '-Atc', query).splitlines() if row]


def lane(name, *args):
    return sh(LANE_SH, name, *args, check=False)


def udid(name):
    info = lane(name, 'info')
    return re.search(r'udid=([0-9A-F-]+)', info).group(1)


def elements(device):
    try:
        return json.loads(sh('idb', 'ui', 'describe-all', '--udid', device))
    except Exception:
        return []


def find(device, pattern):
    rx = re.compile(pattern, re.I)
    for el in elements(device):
        label = el.get('AXLabel') or ''
        if rx.search(label) and el.get('enabled', True):
            f = el['frame']
            return f['x'] + f['width'] / 2, f['y'] + f['height'] / 2, label
    return None


def to_top(name):
    for _ in range(3):
        lane(name, 'swipe', '200', '300', '200', '760')
        time.sleep(0.6)


def tap_label(name, device, pattern, scrolls=6, max_y=780, min_y=120):
    if scrolls:
        to_top(name)
        time.sleep(1.5)
    for attempt in range(scrolls + 1):
        hit = find(device, pattern)
        if hit and min_y < hit[1] < max_y:
            lane(name, 'tap', str(round(hit[0])), str(round(hit[1])))
            return hit[2]
        if attempt == scrolls:
            break
        if hit:
            # Drag it into the band slowly (no fling): the coin card opens where its slot is (RIDE_PARTS_BUGS 24).
            target = (min_y + max_y) / 2
            start = min(max(hit[1], 200), 760)
            end = max(min(start - (hit[1] - target), 760), 140)
            lane(name, 'swipe', '20', str(round(start)), '20', str(round(end)), '1.5')
        else:
            lane(name, 'swipe', '20', '700', '20', '300', '1.5')
        time.sleep(2.0)
    return None


def newest_line(player, since):
    rows = sql(f"select ride_id, task_id, status, eligible_seconds, id from line_play_sessions where user_id={player} "
               f"and (created_at > '{since}' or (status = 'active' and last_checked_at > '{since}')) "
               f"order by created_at desc limit 1")
    return rows[0] if rows else None


def utc_now():
    return sql("select to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')")[0][0]


def park_targets(park, rides, shows, player=None, owned_first=False, open_only=False):
    # Queue rides linked to a published coin; prefer coins whose name differs from the ride's (the bug 9 cases).
    # --owned-first: coins the player already won first (their card opens as a sheet; an unwon coin's card can open
    # below the screen until app-tickets P13 lands).
    owned = (f"exists (select 1 from player_coin_levels l where l.user_id = {player} and l.asset_id = t.asset_id)::int"
             if owned_first and player else "(0 = 1)::int")
    queue = sql(f"""select r.id, r.task_id, t.name, r.name, r.lat, r.lng, (lower(t.name) <> lower(r.name))::int as differs
      from rides r join tasks t on t.id = r.task_id where r.park_id = {park} and r.deleted_at is null and r.published_at is not null
      and t.deleted_at is null and t.published_at is not null and t.archived_at is null and r.type in {QUEUE} and r.lat is not null
      {"and (select upper(w.status) from ride_wait_samples w where w.task_id = t.id order by w.observed_at desc, w.id desc limit 1) = 'OPERATING'" if open_only else ""}
      order by {owned} desc, differs desc, r.id limit {rides}""")
    # Coins with no queue ride at all: shows, landmarks, walk-throughs.
    plain = sql(f"""select t.id, t.name, t.latitude, t.longitude from tasks t join task_collections c on c.id = t.task_collection_id
      where c.park_id = {park} and t.deleted_at is null and t.published_at is not null and t.archived_at is null
      and not exists (select 1 from rides r where r.task_id = t.id and r.type in {QUEUE} and r.deleted_at is null)
      order by t.id limit {shows}""")
    return queue, plain


def coin_label(name):
    return re.escape(name.replace('’', "'")).replace("'", "['’]")


def check_ride(args, device, row):
    ride_id, task_id, coin, ride_name, lat, lng, _ = row
    lane(args.lane, 'gps', f'{lat},{lng}')
    since = utc_now()
    lane(args.lane, 'nav', 'Explore')
    time.sleep(2)
    lane(args.lane, 'nav', 'Park', json.dumps({'park': args.park, 'player': args.player_id}))
    time.sleep(4)
    tapped = tap_label(args.lane, device, rf'^{coin_label(coin)} ride coin', scrolls=10, max_y=420)
    time.sleep(2)
    # The unwon card's LinePlay button, an owned coin's "In its line now? LinePlay" link, or How to get Parts (P16).
    line = tap_label(args.lane, device, r'LinePlay|How to get Parts', scrolls=0, max_y=868) if tapped else None
    if tapped and not line:
        # The unwon card can open low (RIDE_PARTS_BUGS 24, app-tickets P13): drag its sheet up to reach its buttons.
        lane(args.lane, 'swipe', '280', '820', '280', '380', '1.0')
        time.sleep(1.5)
        line = tap_label(args.lane, device, r'LinePlay|How to get Parts', scrolls=0, max_y=868)
    deadline = time.time() + 45
    got = None
    while time.time() < deadline and line:
        got = newest_line(args.player_id, since)
        if got:
            break
        time.sleep(3)
    ok = bool(got) and int(got[0]) == int(ride_id) and int(got[1]) == int(task_id)
    shot = f'P25-{args.park}-{task_id}-line'
    lane(args.lane, 'shot', shot)
    result = {'park': args.park, 'check': 'line', 'coin': coin, 'ride': ride_name, 'want_ride': int(ride_id),
              'got': got[:3] if got else None, 'tapped': tapped, 'lineplay': line, 'ok': ok, 'shot': shot}
    if ok and args.wait:
        session = got[4]
        end = time.time() + 15 * 60
        parts = None
        while time.time() < end:
            parts = sql(f"select coalesce(sum(parts), 0) from line_play_part_milestones where session_id = '{session}'")[0][0]
            if int(parts) >= 1:
                break
            time.sleep(20)
        result['paid_parts'] = int(parts or 0)
        result['ok'] = int(parts or 0) >= 1
        lane(args.lane, 'shot', f'P25-{args.park}-{task_id}-paid')
    return result


def check_wait_times(args, device, row):
    """A Wait Times row starts the line on its ride by the feed id (metadata.themeparks_id), whatever the feed calls it."""
    ride_id, task_id, coin, ride_name, lat, lng, _ = row
    lane(args.lane, 'nav', 'Explore'); time.sleep(2)
    lane(args.lane, 'gps', f'{lat},{lng}')
    since = utc_now()
    lane(args.lane, 'nav', 'QueueTimes', json.dumps({'park': args.park})); time.sleep(5)
    word = max(re.findall(r"[A-Za-z]{4,}", ride_name.replace('\u2019', "'")) or [ride_name], key=len)
    if tap_label(args.lane, device, r'^Find a ride by name', scrolls=0):
        time.sleep(1)
        lane(args.lane, 'type', word)
        time.sleep(3)
    line = tap_label(args.lane, device, r'^Start LinePlay for|^Play line games for', scrolls=0, max_y=868)
    got = None
    deadline = time.time() + 45
    while line and time.time() < deadline:
        got = newest_line(args.player_id, since)
        if got:
            break
        time.sleep(3)
    shot = f'P25-{args.park}-{task_id}-waittimes'
    lane(args.lane, 'shot', shot)
    ok = bool(got) and int(got[0]) == int(ride_id)
    return {'park': args.park, 'check': 'wait_times_line', 'coin': coin, 'ride': ride_name, 'searched': word,
            'want_ride': int(ride_id), 'got': got[:3] if got else None, 'row': line, 'ok': ok, 'shot': shot}


def check_plain(args, device, row):
    task_id, coin, lat, lng = row
    lane(args.lane, 'gps', f'{lat},{lng}')
    lane(args.lane, 'nav', 'Explore')
    time.sleep(2)
    lane(args.lane, 'nav', 'Park', json.dumps({'park': args.park, 'player': args.player_id}))
    time.sleep(4)
    # Shows, landmarks and walk-throughs sit on the shelf's second tab.
    tap_label(args.lane, device, r'^Shows and sights', scrolls=1)
    time.sleep(2)
    tapped = tap_label(args.lane, device, rf'^{coin_label(coin)} ride coin', scrolls=10, max_y=420)
    time.sleep(2)
    offered = find(device, r'LinePlay') if tapped else None
    shot = f'P25-{args.park}-{task_id}-noline'
    lane(args.lane, 'shot', shot)
    return {'park': args.park, 'check': 'no_line', 'coin': coin, 'tapped': tapped, 'lineplay_offered': bool(offered),
            'ok': bool(tapped) and not offered, 'shot': shot}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--lane', required=True)
    ap.add_argument('--player-id', type=int, required=True)
    ap.add_argument('--park', type=int, required=True)
    ap.add_argument('--rides', type=int, default=1)
    ap.add_argument('--shows', type=int, default=1)
    ap.add_argument('--owned-first', action='store_true')
    ap.add_argument('--first-row', action='store_true')
    ap.add_argument('--open-only', action='store_true', help='only rides the live feed marks OPERATING')
    ap.add_argument('--via-wait-times', action='store_true', help='start each line from its Wait Times row')
    ap.add_argument('--wait', action='store_true', help='stay in line until the server pays 1 Part (10 real minutes)')
    args = ap.parse_args()
    device = udid(args.lane)
    queue, plain = park_targets(args.park, 200 if args.first_row else args.rides, args.shows, args.player_id, args.owned_first, args.open_only)
    if args.first_row:
        # Coins in the top shelf row only: their card opens on screen (an unwon card lower down can open below the
        # screen until app-tickets P13 lands). Names are matched loosely (the shelf shows plain display names).
        lane(args.lane, 'nav', 'Explore'); time.sleep(2)
        lane(args.lane, 'gps', f'{queue[0][4]},{queue[0][5]}' if queue else '0,0')
        lane(args.lane, 'nav', 'Park', json.dumps({'park': args.park, 'player': args.player_id})); time.sleep(4)
        to_top(args.lane); time.sleep(1.5)
        slots = [el for el in elements(device) if ' ride coin, ' in (el.get('AXLabel') or '')]
        top = min((el['frame']['y'] for el in slots), default=0)
        row = [el['AXLabel'].split(' ride coin, ')[0] for el in slots if abs(el['frame']['y'] - top) < 20]
        key = lambda n: re.sub(r'[^a-z0-9]', '', n.lower().replace('\u2019', "'"))
        wanted = {key(name) for name in row}
        queue = [r for r in queue if key(r[2]) in wanted][:args.rides]
    failed = False
    for row in queue:
        result = check_wait_times(args, device, row) if args.via_wait_times else check_ride(args, device, row)
        failed |= not result['ok']
        print(json.dumps(result), flush=True)
    for row in plain:
        result = check_plain(args, device, row)
        failed |= not result['ok']
        print(json.dumps(result), flush=True)
    lane(args.lane, 'nav', 'Explore')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
