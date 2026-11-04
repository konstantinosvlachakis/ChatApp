import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AvatarPhotoMenu from "./AvatarPhotoMenu";

const setup = (props = {}) => {
  const triggerRef = createRef();
  const handlers = { onClose: jest.fn(), onView: jest.fn(), onPick: jest.fn() };
  const utils = render(
    <>
      <button ref={triggerRef} type="button">Photo</button>
      <AvatarPhotoMenu open canView triggerRef={triggerRef} {...handlers} {...props} />
    </>
  );
  return { ...utils, ...handlers, triggerRef };
};

describe("AvatarPhotoMenu", () => {
  test("offers See photo and Update photo, focusing the first", () => {
    setup();

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "See photoOpen it full size",
      "Update photoChoose a new picture",
    ]);
    expect(items[0]).toHaveFocus();
  });

  test("See photo closes the menu and opens the viewer", () => {
    const { onClose, onView } = setup();

    fireEvent.click(screen.getByRole("menuitem", { name: /see photo/i }));

    expect(onClose).toHaveBeenCalled();
    expect(onView).toHaveBeenCalledTimes(1);
  });

  test("Update photo opens the file picker and hands over the chosen file", () => {
    const { container, onPick } = setup();
    const input = container.querySelector('input[type="file"]');
    const pickerClick = jest.spyOn(input, "click").mockImplementation(() => {});

    fireEvent.click(screen.getByRole("menuitem", { name: /update photo/i }));
    const file = new File(["x"], "me.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(pickerClick).toHaveBeenCalled();
    expect(onPick).toHaveBeenCalledWith(file);
  });

  test("without a real photo only Update photo is offered", () => {
    setup({ canView: false });

    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: /update photo/i })).toBeInTheDocument();
  });

  test("Escape closes and returns focus to the photo; arrows move between items", () => {
    const { onClose, triggerRef } = setup();
    const [see, update] = screen.getAllByRole("menuitem");

    fireEvent.keyDown(see, { key: "ArrowDown" });
    expect(update).toHaveFocus();
    fireEvent.keyDown(update, { key: "ArrowDown" });
    expect(see).toHaveFocus();

    fireEvent.keyDown(see, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(triggerRef.current).toHaveFocus();
  });

  test("a click outside closes it", () => {
    const { onClose } = setup();

    fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalled();
  });
});
