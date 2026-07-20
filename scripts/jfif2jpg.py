import sys
from pathlib import Path
from PIL import Image

def convert_jfif_to_jpg(directory_path):
    dir_path = Path(directory_path)
    
    # Verify the directory exists
    if not dir_path.is_dir():
        print(f"Error: '{directory_path}' is not a valid directory.")
        sys.exit(1)
        
    # Find all .jfif files (case-insensitive)
    jfif_files = list(dir_path.glob('*.[jJ][fF][iI][fF]'))
    
    if not jfif_files:
        print("No .jfif files found in the directory.")
        return

    print(f"Found {len(jfif_files)} .jfif file(s). Starting conversion...")

    for file_path in jfif_files:
        try:
            # Open the image and save it as a .jpg
            with Image.open(file_path) as img:
                # Convert RGBA/P formats to RGB if necessary (JFIF is typically RGB)
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                output_path = file_path.with_suffix('.jpg')
                img.save(output_path, 'JPEG')
                print(f"Converted: {file_path.name} -> {output_path.name}")
        except Exception as e:
            print(f"Failed to convert {file_path.name}: {e}")

if __name__ == "__main__":
    # Check if the directory argument was provided
    if len(sys.argv) != 2:
        print("Usage: python convert.py <directory_path>")
        sys.exit(1)
        
    target_directory = sys.argv[1]
    convert_jfif_to_jpg(target_directory)
