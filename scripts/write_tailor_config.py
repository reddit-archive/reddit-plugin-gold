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
        svgs = {}
        tailor = None
        try:
            with open(tailor_config_path) as config_file:
                tailor = json.load(config_file)
        except IOError:
            tailor = {}        
        if not tailor:
            tailor = {}
        tailor.setdefault("allow_clear", True)
        tailor.setdefault("flip_x", False)
        tailor.setdefault("flippable", False)
        tailor.setdefault("name", directory)
        tailor.setdefault("asset_path", directory)
        tailor.setdefault("ui-order", 0)
        tailor.setdefault("use_dynamic_color", False)
        tailor.setdefault("z-index", 100)

        tailor['dressings'] = []
        svg_paths = glob.glob(os.path.join(sprite_folder, directory, '*.svg'))
        for svg_path in svg_paths:
            name = os.path.splitext(os.path.basename(svg_path))[0]

            # add dressing name
            tailor['dressings'].append({
                "name": name
            })

            # read svg source
            with open(svg_path, 'r') as svg_file:
                svgs[name] = svg_file.read().replace('\n', '').replace('\r', '').strip()

        if tailor["flippable"]:
            flipped_tailor = tailor.copy()
            flipped_tailor["name"] = 'flipped_' + tailor["name"]
            flipped_tailor["flip_x"] = True
            flipped_tailor["ui-order"] = tailor["ui-order"] - 1;
            flipped_tailor["z-index"] = tailor["z-index"] - 1;
            tailors.append(flipped_tailor)
        tailors.append(tailor)

        # bundle individual SVGs together inside of each category
        svg_bundle_output_path = os.path.join(sprite_folder, directory, 'svg_bundle.json')
        with open(svg_bundle_output_path, 'w') as svg_bundle:
            json.dump(svgs, svg_bundle, indent=4)

    with open(output_path, 'w') as output_file:
        json.dump(tailors, output_file, indent=4)


if __name__ == '__main__':
    import sys
    print write_tailor_config(sys.argv[1], sys.argv[2])
