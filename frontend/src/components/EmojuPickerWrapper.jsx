import React, { useRef } from "react";
import "emoji-picker-element";

export const EmojiPickerWrapper = ({ onEmojiSelect }) => {
  const pickerRef = useRef(null);

  React.useEffect(() => {
    const picker = pickerRef.current;

    const handleEmojiClick = (event) => {
      if (onEmojiSelect) {
        onEmojiSelect(event.detail.unicode);
      }
    };

    if (picker) {
      picker.addEventListener("emoji-click", handleEmojiClick);
    }

    return () => {
      if (picker) {
        picker.removeEventListener("emoji-click", handleEmojiClick);
      }
    };
  }, [onEmojiSelect]);

  return <emoji-picker ref={pickerRef}></emoji-picker>;
};
