import { isPlaceholderPhoto } from "./media";
import { resolveAvatarUrl } from "../pages/Conversations/features/ChatAvatar";
import { resolveMediaUrl } from "../pages/Profile/features/profileUtils";

// Profile.profile_image_url defaults to profile_images/MainAfter.jpg, which production
// doesn't serve: treating it as a photo cost a 404 per avatar on every page.
describe("placeholder profile photo", () => {
  test.each([
    [undefined, true],
    ["", true],
    ["profile_images/MainAfter.jpg", true],
    ["/media/profile_images/MainAfter.jpg", true],
    ["https://www.langvoyage.com/media/profile_images/MainAfter.jpg", true],
    ["https://res.cloudinary.com/demo/image/upload/v1/profile_images/ana.jpg", false],
    ["profile_images/ana.jpg", false],
  ])("%s -> %s", (url, expected) => {
    expect(isPlaceholderPhoto(url)).toBe(expected);
  });

  test("no resolver builds a URL for it", () => {
    expect(resolveAvatarUrl("profile_images/MainAfter.jpg")).toBeNull();
    expect(resolveMediaUrl("profile_images/MainAfter.jpg")).toBe("");
    expect(resolveAvatarUrl("profile_images/ana.jpg")).toMatch(/\/media\/profile_images\/ana\.jpg$/);
  });
});
