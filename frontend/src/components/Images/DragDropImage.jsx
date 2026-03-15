import React, { useState, useEffect } from "react";
import axios from "axios";
import { BASE_URL } from "../../constants/constants";
import { useUser } from "../../context/UserContext";

const DragDropImage = ({ initialImage }) => {
  const { user } = useUser();
  const [droppedImage, setDroppedImage] = useState(initialImage); // Stores the current image
  const [isDraggingOver, setIsDraggingOver] = useState(false); // Tracks drag state
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false); // Tracks zoom modal state

  useEffect(() => {
    setDroppedImage(initialImage); // <<===== ADD THIS useEffect
  }, [initialImage]);

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDraggingOver(true); // Set state to true when dragging over the area
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDraggingOver(false); // Set state to false when leaving the area
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDraggingOver(false); // Reset dragging state

    const file = event.dataTransfer.files[0]; // Get the dropped file
    if (file && file.type.startsWith("image/")) {
      const imageUrl = URL.createObjectURL(file); // Create a preview URL
      setDroppedImage(imageUrl); // Update the state with the dropped image
      updateProfileImage(file); // Send the file to the server to update the user's profile image
    } else {
      alert("Please drop a valid image file."); // Handle invalid files
    }
  };

  const updateProfileImage = async (file) => {
    const formData = new FormData();
    formData.append("profile_image", file);

    try {
      const response = await axios.patch(
        `${BASE_URL}/api/profile/${user.user_id}/update-image`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          withCredentials: true,
        }
      );
      console.log("Server response:", response.data);
    } catch (error) {
      console.error(
        "Error updating the profile image:",
        error.response?.data || error.message
      );
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
      <img
        src={droppedImage}
        alt="Profile"
        className="absolute top-0 left-0 w-full h-full object-cover cursor-pointer"
        onClick={() => setIsZoomModalOpen(true)}
      />

      {isDraggingOver && (
        <div className="absolute top-0 left-0 w-full h-full rounded-full bg-black bg-opacity-50 flex items-center justify-center">
          <p className="text-white text-lg font-semibold">Drop Here</p>
        </div>
      )}

      {isZoomModalOpen && (
        <div className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50">
          <img
            src={droppedImage}
            alt="Zoomed"
            className="w-auto max-w-full h-auto max-h-full"
          />
          <button
            className="absolute top-4 right-4 text-white text-xl font-bold"
            onClick={() => setIsZoomModalOpen(false)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default DragDropImage;
