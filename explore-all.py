import json, sys

def explore(path, label):
    try:
        d = json.load(open(path))
    except:
        print(f'=== {label}: file not found ===')
        return
    
    print(f'\n=== {label} ===')
    
    # Recursively find all lists that look like content
    def find_lists(obj, prefix='', depth=0):
        if depth > 5: return
        if isinstance(obj, dict):
            for k, v in obj.items():
                p = f'{prefix}.{k}' if prefix else k
                if isinstance(v, list) and len(v) > 0:
                    print(f'  {p}: list({len(v)})')
                    first = v[0]
                    if isinstance(first, dict):
                        keys = list(first.keys())[:8]
                        print(f'    keys: {keys}')
                        # Check for aweme_info
                        if 'aweme_info' in first:
                            ai = first['aweme_info']
                            stats = ai.get('statistics', {})
                            author = ai.get('author', {})
                            print(f'    aweme_info.desc: {ai.get("desc","")[:50]}')
                            print(f'    stats: play={stats.get("play_count")}, digg={stats.get("digg_count")}, comment={stats.get("comment_count")}')
                            print(f'    author: {author.get("nickname")}, followers={author.get("follower_count")}')
                        # Check for word/sentence
                        if 'word' in first or 'sentence' in first or 'hot_value' in first:
                            print(f'    word={first.get("word","")[:40]}, sentence={first.get("sentence","")[:40]}, hot_value={first.get("hot_value")}')
                    elif isinstance(first, str):
                        print(f'    first: "{first[:60]}"')
                elif isinstance(v, dict):
                    find_lists(v, p, depth+1)
        elif isinstance(obj, list) and len(obj) > 0 and isinstance(obj[0], dict):
            for k, v in obj[0].items():
                if isinstance(v, (dict, list)):
                    find_lists(v, f'{prefix}[0].{k}', depth+1)
    
    find_lists(d)

explore('/tmp/hot1.json', '热搜榜 (fetch_hot_total_search_list)')
explore('/tmp/hot2.json', '热词榜 (fetch_hot_total_hot_word_list)')
explore('/tmp/hot3.json', '低粉爆款 (fetch_hot_total_low_fan_list)')
explore('/tmp/hot5.json', '热搜v3 (fetch_hot_search_list)')
