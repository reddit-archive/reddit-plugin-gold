import glob
import json
import os

def write_tailor_config(sprite_folder, output_path):
    sprite_folder = os.path.abspath(sprite_folder)
    output_path = os.path.abspath(output_path)
    sprite_directories = os.walk(sprite_folder).next()[1]
    tailors = []
    
    # each folder == a tailor
    for directory in sprite_directories:
        # each directory can contain a tailor.json file to override defaults
        tailor_config_path = os.path.join(sprite_folder, directory, 'tailor.json')
        tailor = None
        try:
            with open(tailor_config_path) as config_file:
                tailor = json.load(config_file)
        except IOError:
            tailor = {}        
        if not tailor:
            tailor = {}
        tailor.setdefault("allow_clear", True)
        tailor.setdefault("name", directory)
        tailor.setdefault("spritesheet", directory)
        tailor.setdefault("use_dynamic_color", False)
        tailor.setdefault("z-index", 100)
        
        tailor['dressings'] = []
        sprite_paths = glob.glob(os.path.join(
            sprite_folder, directory, '*.png'))
        for sprite_path in sprite_paths:
            name = os.path.splitext(os.path.basename(sprite_path))[0]
            tailor['dressings'].append({
                "name": name,
            })
        tailors.append(tailor)

    with open(output_path, 'w') as output_file:
        json.dump(tailors, output_file, indent=4)


if __name__ == '__main__':
    import sys
    print write_tailor_config(sys.argv[1], sys.argv[2])
