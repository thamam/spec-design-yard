from PIL import Image
import numpy as np
import sys
import os

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    img_path = os.path.join(base_dir, "v0-workspace-screenshot.png")
    if not os.path.exists(img_path):
        print(f"ERROR: Screenshot file not found at {img_path}")
        sys.exit(1)
        
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
        
    # Validation Check: Ensure we have actual UI and sketchy elements
    if len(unique_colors) < 100:
        print(f"ERROR: Screen validation failed. Right-hand canvas has too few unique colors ({len(unique_colors)}). Is it blank/white/unloaded?")
        sys.exit(1)
        
    # Ensure no single color is > 95% of the RHS
    max_pct = (counts[sorted_idx[0]] / len(flat_pixels)) * 100
    if max_pct > 95.0:
        print(f"ERROR: Screen validation failed. Single dominant color covers {max_pct:.2f}% of canvas (exceeds 95% threshold). Canvas is likely blank.")
        sys.exit(1)
        
    print("SUCCESS: Screenshot validation passed! Excalidraw canvas is verified to have rendered visual elements.")
    sys.exit(0)

if __name__ == "__main__":
    main()
