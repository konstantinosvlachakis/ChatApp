import React, { useState } from "react";

const DragDropImage = ({ onImageDrop, initialImage }) => {
  const [droppedImage, setDroppedImage] = useState(initialImage); // Stores the current image
  const [isDraggingOver, setIsDraggingOver] = useState(false); // Tracks drag state
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false); // Tracks zoom modal state
  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDraggingOver(true); // Set dragging state
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDraggingOver(false); // Reset dragging state
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDraggingOver(false); // Reset dragging state

    const file = event.dataTransfer.files[0]; // Get the dropped file
    if (file && file.type.startsWith("image/")) {
      const imageUrl = URL.createObjectURL(file); // Create a preview URL
      setDroppedImage(imageUrl); // Update the state with the dropped image
      if (onImageDrop) onImageDrop(file); // Notify parent of the dropped image
    } else {
      alert("Please drop a valid image file."); // Handle invalid files
    }
  };

  const handleClick = () => {
    const fileInput = document.getElementById("file-input");
    fileInput.click(); // Simulate a click on the hidden file input
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith("image/")) {
      const imageUrl = URL.createObjectURL(file);
      setDroppedImage(imageUrl);
      if (onImageDrop) onImageDrop(file); // Notify parent
    } else {
      alert("Please select a valid image file.");
    }
  };

  return (
    <div
      className={`relative w-40 h-40 rounded-full overflow-hidden border-4 ${
        isDraggingOver ? "border-blue-500" : "border-gray-400"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Background Image */}
      <img
        src={initialImage}
        alt="Profile"
        className="absolute top-0 left-0 w-full h-full object-cover cursor-pointer"
        onClick={() => setIsZoomModalOpen(true)} // Open zoom modal on click
      />

      {/* Overlay Text (Visible on Dragging) */}
      {isDraggingOver && (
        <div className="absolute top-0 left-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center">
          <p className="text-white text-lg font-semibold">Drop Here</p>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        id="file-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Zoom Modal */}
      {isZoomModalOpen && (
        <div className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50">
          <img
            src={initialImage}
            alt="Zoomed"
            className="w-auto max-w-full h-auto max-h-full"
          />
          <button
            className="absolute top-4 right-4 text-white text-xl font-bold"
            onClick={() => setIsZoomModalOpen(false)} // Close zoom modal
          >
            ✕
          </button>
        </div>
      )}

      {/* Upload Button */}
      <button
        className="absolute bottom-2 right-2 bg-blue-500 text-white p-2 rounded-full shadow-md"
        onClick={handleClick} // Open file input dialog
      >
        📤
      </button>
    </div>
  );
};

export default DragDropImage;
