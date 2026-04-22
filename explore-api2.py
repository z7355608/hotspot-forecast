import sys, json

raw = json.load(sys.stdin)
bd = raw.get('data', {}).get('business_data', [])
print(f'business_data: {len(bd)} items')

# Look at first item's data field
if bd:
    first = bd[0]
    d = first.get('data', {})
    print(f'\nFirst item card_id: {first.get("card_id")}')
    print(f'First item.data keys: {list(d.keys())[:20]}')
    
    # Check for aweme-like fields
    stats = d.get('statistics', {})
    if stats:
        print(f'statistics: {json.dumps(stats)}')
    
    author = d.get('author', {})
    if author:
        print(f'author nickname: {author.get("nickname")}')
        print(f'author follower_count: {author.get("follower_count")}')
        print(f'author sec_uid: {author.get("sec_uid", "")[:30]}')
    
    print(f'desc: {d.get("desc", "")[:120]}')
    print(f'aweme_id: {d.get("aweme_id")}')
    print(f'create_time: {d.get("create_time")}')
    
    # Print all top-level keys with types
    print(f'\nAll data keys:')
    for k in sorted(d.keys()):
        v = d[k]
        if isinstance(v, dict):
            print(f'  {k}: dict({len(v)} keys)')
        elif isinstance(v, list):
            print(f'  {k}: list({len(v)})')
        elif isinstance(v, str):
            print(f'  {k}: str "{v[:60]}"')
        elif isinstance(v, (int, float)):
            print(f'  {k}: {v}')
        else:
            print(f'  {k}: {type(v).__name__}')

# Check has_more/cursor at top level
d2 = raw.get('data', {})
bc = d2.get('business_config', {})
if isinstance(bc, dict):
    print(f'\nbusiness_config: {json.dumps(bc)[:200]}')

gc = d2.get('global_config', {})
if isinstance(gc, dict):
    print(f'global_config keys: {list(gc.keys())[:10]}')

# Count items with video data
video_count = 0
for item in bd:
    d = item.get('data', {})
    if d.get('aweme_id') or d.get('statistics'):
        video_count += 1
print(f'\nItems with aweme_id/statistics: {video_count}/{len(bd)}')

# Print stats for first 5 items
print('\nFirst 5 items summary:')
for i, item in enumerate(bd[:5]):
    d = item.get('data', {})
    stats = d.get('statistics', {})
    author = d.get('author', {})
    print(f'  {i}: aweme_id={d.get("aweme_id")}, desc="{d.get("desc", "")[:40]}", '
          f'play={stats.get("play_count", "N/A")}, digg={stats.get("digg_count", "N/A")}, '
          f'author={author.get("nickname", "N/A")}, followers={author.get("follower_count", "N/A")}')
