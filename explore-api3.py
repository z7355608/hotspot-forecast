import sys, json

raw = json.load(sys.stdin)
bd = raw.get('data', {}).get('business_data', [])

# The data is nested: bd[i].data.aweme_info
if bd:
    first = bd[0]
    d = first.get('data', {})
    ai = d.get('aweme_info', {})
    
    if ai:
        print(f'aweme_info found! Keys count: {len(ai.keys())}')
        print(f'aweme_id: {ai.get("aweme_id")}')
        print(f'desc: {ai.get("desc", "")[:120]}')
        print(f'create_time: {ai.get("create_time")}')
        
        stats = ai.get('statistics', {})
        print(f'statistics: {json.dumps(stats)}')
        
        author = ai.get('author', {})
        print(f'author nickname: {author.get("nickname")}')
        print(f'author follower_count: {author.get("follower_count")}')
        print(f'author sec_uid: {str(author.get("sec_uid", ""))[:40]}')
    else:
        print('No aweme_info in first item')

# Check business_config for pagination
bc = raw.get('data', {}).get('business_config', {})
if isinstance(bc, dict):
    print(f'\nhas_more: {bc.get("has_more")}')
    np = bc.get('next_page', {})
    if isinstance(np, dict):
        print(f'next_page cursor: {np.get("cursor")}')
        print(f'next_page search_id: {str(np.get("search_request_id", ""))[:40]}')

# Print summary for all items
print(f'\n=== All {len(bd)} items ===')
for i, item in enumerate(bd):
    d = item.get('data', {})
    ai = d.get('aweme_info', {})
    if ai:
        stats = ai.get('statistics', {})
        author = ai.get('author', {})
        print(f'{i}: [{d.get("card_id", "?")}] aweme_id={ai.get("aweme_id")}, '
              f'desc="{ai.get("desc", "")[:35]}", '
              f'play={stats.get("play_count", "?")}, digg={stats.get("digg_count", "?")}, '
              f'comment={stats.get("comment_count", "?")}, share={stats.get("share_count", "?")}, '
              f'collect={stats.get("collect_count", "?")}, '
              f'author={author.get("nickname", "?")}, followers={author.get("follower_count", "?")}')
    else:
        print(f'{i}: [{d.get("card_id", first.get("card_id", "?"))}] no aweme_info, keys={list(d.keys())[:5]}')
