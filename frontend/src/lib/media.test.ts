import { avatarImage, cloudinaryImage } from "./media";

const CLOUD = "https://res.cloudinary.com/demo-cloud";

describe("cloudinaryImage", () => {
  test("adds a face-centred fill transformation for avatars at 2x", () => {
    expect(cloudinaryImage(`${CLOUD}/image/upload/v1712/media/profile_images/a.jpg`, { width: 48, dpr: 2 })).toBe(
      `${CLOUD}/image/upload/f_auto,q_auto,c_fill,g_face,w_96,h_96/v1712/media/profile_images/a.jpg`
    );
  });

  test("uses explicit height for fill and keeps 1x on standard screens", () => {
    expect(cloudinaryImage(`${CLOUD}/image/upload/media/a.png`, { width: 40, height: 60, dpr: 1 })).toBe(
      `${CLOUD}/image/upload/f_auto,q_auto,c_fill,g_face,w_40,h_60/media/a.png`
    );
  });

  test("caps the pixel ratio at 2", () => {
    expect(cloudinaryImage(`${CLOUD}/image/upload/v1/a.jpg`, { width: 100, dpr: 3 })).toContain("w_200,h_200/");
  });

  test("limit crop only constrains width", () => {
    expect(cloudinaryImage(`${CLOUD}/image/upload/v1/media/chat/b.jpg?x=1`, { width: 480, crop: "limit", dpr: 2 })).toBe(
      `${CLOUD}/image/upload/f_auto,q_auto,c_limit,w_960/v1/media/chat/b.jpg?x=1`
    );
  });

  test("leaves URLs that already have a transformation alone", () => {
    const url = `${CLOUD}/image/upload/c_thumb,w_50/v1/a.jpg`;
    expect(cloudinaryImage(url, { width: 48, dpr: 2 })).toBe(url);
  });

  test("does not mistake folder names with underscores for transformations", () => {
    expect(cloudinaryImage(`${CLOUD}/image/upload/my_photos/a.jpg`, { width: 10, dpr: 1 })).toBe(
      `${CLOUD}/image/upload/f_auto,q_auto,c_fill,g_face,w_10,h_10/my_photos/a.jpg`
    );
  });

  test.each([
    `${CLOUD}/video/upload/v1/media/voice/note.webm`,
    `${CLOUD}/raw/upload/v1/media/voice/note.m4a`,
    `${CLOUD}/image/private/v1/a.jpg`,
    "ftp://res.cloudinary.com/demo-cloud/image/upload/v1/a.jpg",
    "https://example.com/demo-cloud/image/upload/v1/a.jpg",
    "http://localhost:8000/media/profile_images/a.jpg",
    "/media/profile_images/a.jpg",
    "/static/media/default-avatar.1234.jpg",
    "data:image/png;base64,AAAA",
    "blob:http://localhost/1234",
    "",
  ])("returns %s unchanged", (url) => {
    expect(cloudinaryImage(url, { width: 48 })).toBe(url);
  });

  test("handles missing values", () => {
    expect(cloudinaryImage(null, { width: 48 })).toBe("");
    expect(cloudinaryImage(undefined, { width: 48 })).toBe("");
  });

  test("avatarImage is a square fill", () => {
    expect(avatarImage(`${CLOUD}/image/upload/v1/a.jpg`, 36)).toMatch(/\/f_auto,q_auto,c_fill,g_face,w_36,h_36\//);
  });
});
