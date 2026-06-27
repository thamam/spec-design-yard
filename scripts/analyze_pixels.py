from PIL import Image
import numpy as np

def main():
    img_path = "/home/ubuntu/spec-design-yard/v0-workspace-screenshot.png"
    img = Image.open(img_path)
    w, h = img.size
    print(f"Image size: {w}x{h}")
    
    # We want to check the right-hand side of the screenshot (which is the Canvas Panel)
    # The split is at splitPercent (approx 42%), so RHS starts around x = w * 0.45
    rhs_start = int(w * 0.45)
    
    # Convert RHS area to numpy array
    img_arr = np.array(img)
    rhs_pixels = img_arr[:, rhs_start:, :3] # Keep RGB, ignore Alpha
    
    # Reshape to a list of pixels
    flat_pixels = rhs_pixels.reshape(-1, 3)
    
    # Count unique colors
    unique_colors, counts = np.unique(flat_pixels, axis=0, return_counts=True)
    print(f"Number of unique colors in RHS: {len(unique_colors)}")
    
    # Show the top 5 most common colors
    sorted_idx = np.argsort(-counts)
    print("Top 5 common colors on RHS:")
    for idx in sorted_idx[:5]:
        color = unique_colors[idx]
        count = counts[idx]
        percentage = (count / len(flat_pixels)) * 100
        print(f"  RGB: {list(color)} - {count} pixels ({percentage:.2f}%)")

if __name__ == "__main__":
    main()
