import { DoorOpen, House, Sofa, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { Service, ServiceCategory } from "@/lib/catalog/catalog";
import { servicePhoto } from "./service-photos";

// A service's picture: the photo admin added to it (B10, services.photo_url), else the app's own photo
// for it (src/components/customer/service-photos.ts), otherwise its type's icon on a quiet tile of the
// same size, so a new service never leaves a hole.
// The tile is decorative: the service's name sits right next to it.
const typeIcons: Record<ServiceCategory, LucideIcon> = {
  "whole-home": House,
  rooms: DoorOpen,
  fabrics: Sofa,
};

// The tile's colours, and the fill a photo shows while it loads.
const tones = {
  evergreen: { tile: "bg-brand-50 text-brand-700", photo: "bg-surface-sunken" },
  forest: { tile: "bg-lime-wash text-on-lime-wash", photo: "bg-sunken" },
  sunken: { tile: "bg-sunken text-ink-muted", photo: "bg-sunken" },
};

type ServiceVisualProps = {
  service: Service;
  /** next/image sizes, for the photo's width on each screen. */
  sizes: string;
  /** Size, shape and position, the same for the photo and the tile. */
  className: string;
  /** Fill the positioned parent instead of sizing by the photo's own proportions. */
  fill?: boolean;
  /** Size of the icon on the tile. */
  iconClassName?: string;
  /** evergreen: the T3b customer pages; forest: the landing page; sunken: the admin services list
   * (markdown/design.md). */
  tone?: keyof typeof tones;
};

export function ServiceVisual({
  service,
  sizes,
  className,
  fill = false,
  iconClassName = "size-6",
  tone = "evergreen",
}: ServiceVisualProps) {
  const t = useTranslations("ServicePhotos");
  const locale = useLocale();
  const match = servicePhoto(service.id);

  if (service.photoUrl) {
    // Admin's photo has no written description, so its alt text is the service's name. Its size is not
    // known, so it is cropped into the same 3:2 frame as the app's photos. A bucket photo is served as
    // it is (unoptimized), as the cleaner photos are, so no remote host has to be allowed for next/image.
    const size = fill ? { fill: true } : { width: 1200, height: 800 };
    return (
      <Image
        src={service.photoUrl}
        alt={service.name[locale]}
        sizes={sizes}
        {...size}
        unoptimized={!service.photoUrl.startsWith("/")}
        className={`object-cover ${tones[tone].photo} ${className}`}
      />
    );
  }

  if (!match) {
    const Icon = typeIcons[service.category];
    return (
      <span
        aria-hidden="true"
        className={`flex items-center justify-center ${fill ? "absolute inset-0" : ""} ${tones[tone].tile} ${className}`}
      >
        <Icon className={iconClassName} strokeWidth={1.75} />
      </span>
    );
  }

  const { key, photo } = match;
  const size = fill ? { fill: true } : { width: photo.width, height: photo.height };
  return (
    <Image
      src={photo.src}
      alt={t(key)}
      sizes={sizes}
      {...size}
      style={{ objectPosition: photo.focus }}
      className={`object-cover ${tones[tone].photo} ${className}`}
    />
  );
}
