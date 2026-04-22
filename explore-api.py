import sys, json

data = json.load(sys.stdin)
bd = data.get('data', {}).get('business_data')
print('business_data type:', type(bd).__name__)

if isinstance(bd, list):
    print(f'business_data is list of {len(bd)} items')
    if bd:
        first = bd[0]
        if isinstance(first, dict):
            print(f'First item keys: {list(first.keys())[:15]}')
            # Look for aweme_info
            if 'aweme_info' in first:
                ai = first['aweme_info']
                print(f'aweme_info keys: {list(ai.keys())[:15]}')
                stats = ai.get('statistics', {})
                print(f'statistics: {json.dumps(stats)}')
                author = ai.get('author', {})
                print(f'author nickname: {author.get("nickname")}')
                print(f'author follower_count: {author.get("follower_count")}')
                print(f'desc: {ai.get("desc", "")[:100]}')
                print(f'aweme_id: {ai.get("aweme_id")}')
                print(f'create_time: {ai.get("create_time")}')
            else:
                # Print first item structure
                for k, v in first.items():
                    vtype = type(v).__name__
                    vstr = str(v)[:80] if not isinstance(v, (dict, list)) else f'{vtype}({len(v) if isinstance(v, list) else len(v.keys())} items)'
                    print(f'  {k}: {vstr}')
        # Check a few more items
        for i in range(min(3, len(bd))):
            item = bd[i]
            if isinstance(item, dict):
                has_aweme = 'aweme_info' in item
                card_type = item.get('card_unique_name', item.get('type', 'unknown'))
                print(f'  Item {i}: type={card_type}, has_aweme_info={has_aweme}')
elif isinstance(bd, dict):
    print(f'business_data keys: {list(bd.keys())[:20]}')

# Also check for cursor/has_more
d = data.get('data', {})
print(f'\ncursor: {d.get("cursor")}')
print(f'has_more: {d.get("has_more")}')
print(f'search_id: {d.get("business_config", {}).get("search_id") if isinstance(d.get("business_config"), dict) else "N/A"}')
