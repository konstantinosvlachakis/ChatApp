import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import PhotoViewer, { buildPhotoGallery, usePhotoViewer } from "./PhotoViewer";
import { DEFAULT_AVATAR_URL } from "../constants/avatar";

const entries = [
  { key: "profile", src: "https://cdn.example/a.jpg", alt: "Profile picture" },
  { key: "complementary_1", src: DEFAULT_AVATAR_URL, alt: "Default chameleon" },
  { key: "complementary_2", src: "", alt: "Empty slot" },
  { key: "complementary_3", src: "https://cdn.example/b.jpg", alt: "Beach photo" },
  { key: "complementary_4", src: "https://cdn.example/c.jpg", alt: "Cafe photo" },
];

function Gallery({ photos = entries }) {
  const gallery = buildPhotoGallery(photos);
  const viewer = usePhotoViewer();
  const [closed, setClosed] = useState(0);
  return (
    <div>
      {gallery.map((photo, index) => (
        <button
          key={photo.key}
          type="button"
          aria-label={`View photo ${index + 1} of ${gallery.length}`}
          onClick={(event) => viewer.open(index, event)}
        >
          thumb
        </button>
      ))}
      <PhotoViewer
        photos={gallery}
        index={viewer.index}
        onClose={() => {
          viewer.close();
          setClosed((count) => count + 1);
        }}
        returnFocusRef={viewer.triggerRef}
      />
      <span data-testid="closed">{closed}</span>
    </div>
  );
}

const shownImage = () => screen.getByRole("img");

describe("PhotoViewer", () => {
  test("buildPhotoGallery drops empty and chameleon placeholder slots", () => {
    expect(buildPhotoGallery(entries).map((photo) => photo.key)).toEqual([
      "profile",
      "complementary_3",
      "complementary_4",
    ]);
  });

  test("opens on the clicked photo, pages with buttons and arrow keys, wraps around", () => {
    render(<Gallery />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByRole("button", { name: /View photo/ })).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "View photo 2 of 3" }));
    const dialog = screen.getByRole("dialog");
    expect(shownImage()).toHaveAttribute("alt", "Beach photo");
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close photo viewer" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(shownImage()).toHaveAttribute("alt", "Profile picture");
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  test("Escape closes, restores scrolling and returns focus to the thumbnail", () => {
    render(<Gallery />);
    const thumb = screen.getByRole("button", { name: "View photo 3 of 3" });
    fireEvent.click(thumb);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(thumb).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  test("backdrop click and the close button close it; the image itself doesn't", () => {
    render(<Gallery />);
    fireEvent.click(screen.getByRole("button", { name: "View photo 1 of 3" }));
    fireEvent.click(shownImage());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "View photo 1 of 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Close photo viewer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("closed")).toHaveTextContent("2");
  });

  test("a horizontal swipe changes photo", () => {
    render(<Gallery />);
    fireEvent.click(screen.getByRole("button", { name: "View photo 1 of 3" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.touchStart(dialog, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 120, clientY: 210 }] });
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
  });

  test("a single photo has no counter or paging buttons", () => {
    render(<Gallery photos={[entries[0], entries[1]]} />);
    fireEvent.click(screen.getByRole("button", { name: "View photo 1 of 1" }));
    expect(screen.queryByText("1 / 1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next photo" })).toBeNull();
  });
});
