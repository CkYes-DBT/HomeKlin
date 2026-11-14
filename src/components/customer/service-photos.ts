import type { Service } from "@/lib/catalog/catalog";

// The photos of HomeKlin's services (stock photos in public/images, credits in
// markdown/image-sources.md), by service id. Since B10 admin can add a photo to a service itself
// (services.photo_url), which comes first; this map is the fallback for the services without one, and a
// service with neither shows its type's icon.
// Each photo's alt text is ServicePhotos.<id> in src/messages/*.json.

export type ServicePhoto = {
  src: string;
  width: number;
  height: number;
  /** The CSS object-position to keep in frame when a crop cuts the photo (default centre). */
  focus?: string;
};

const photos = {
  regular: { src: "/images/service-regular.jpg", width: 1200, height: 675 },
  deep: { src: "/images/service-deep.jpg", width: 1200, height: 800 },
  "sofa-carpet": { src: "/images/service-sofa.jpg", width: 1200, height: 800 },
  "kitchen-bathroom": { src: "/images/service-kitchen-bath.jpg", width: 1200, height: 800, focus: "50% 25%" },
} as const satisfies Record<string, ServicePhoto>;

export type ServicePhotoKey = keyof typeof photos;

function isPhotoKey(id: string): id is ServicePhotoKey {
  return Object.hasOwn(photos, id);
}

/** The photo of a service and the key of its alt text, or null when it has none. */
export function servicePhoto(serviceId: string): { key: ServicePhotoKey; photo: ServicePhoto } | null {
  return isPhotoKey(serviceId) ? { key: serviceId, photo: photos[serviceId] } : null;
}

export function hasServicePhoto(service: Service): boolean {
  return Boolean(service.photoUrl) || servicePhoto(service.id) !== null;
}
