from PIL import Image
import numpy as np

def main():
    img_path = "/home/ubuntu/spec-design-yard/v0-workspace-screenshot.png"
    img = Image.open(img_path)
    w, h = img.size
    print(f"Image size: {w}x{h}")
    
    img_arr = np.array(img)
    flat_pixels = img_arr.reshape(-1, img_arr.shape[-1])
    
    unique_colors, counts = np.unique(flat_pixels, axis=0, return_counts=True)
    print(f"Total unique colors in entire image: {len(unique_colors)}")
    
    sorted_idx = np.argsort(-counts)
    print("Top 5 common colors in entire image:")
    for idx in sorted_idx[:5]:
        color = unique_colors[idx]
        count = counts[idx]
        percentage = (count / len(flat_pixels)) * 100
        print(f"  Color: {list(color)} - {count} pixels ({percentage:.2f}%)")

if __name__ == "__main__":
    main()
