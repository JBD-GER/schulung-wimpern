import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/landing-page";
import type { PublicProductView } from "@/components/marketing/price-display";
import { COURSE, FAQS } from "@/data/course";
import { getPublicProduct } from "@/lib/server/catalog";
import { getReleaseContract } from "@/lib/server/release";

// Stripe/DB SDK calls are not fetch()-cache aware. Resolve price and release
// readiness at request time so a build can never freeze a stale Offer.
export const dynamic = "force-dynamic";

const title = "Online Schulung Wimpernverlängerung | 1:1-Technik & Zertifikat";
const description =
  "Lerne professionelle 1:1-Wimpernverlängerung flexibel online. Sieben Lektionen, Wissenstests, sofortiger Zugang und persönliches Abschlusszertifikat.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: "/",
    title,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

async function loadProduct(): Promise<PublicProductView> {
  try {
    return await getPublicProduct();
  } catch {
    return {
      name: COURSE.productName,
      unitAmount: null,
      currency: "EUR",
      taxBehavior: null,
      available: false,
    };
  }
}

export default async function HomePage() {
  const product = await loadProduct();
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");
  const release = getReleaseContract();
  const organizationName =
    release.legal.releasedProvider?.companyName ??
    "Schulung Wimpernverlängerung";

  const offer =
    product.unitAmount !== null
      ? {
          "@type": "Offer",
          url: `${siteUrl}/checkout`,
          price: (product.unitAmount / 100).toFixed(2),
          priceCurrency: product.currency.toUpperCase(),
          availability: product.available
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        }
      : undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: organizationName,
        url: siteUrl,
        logo: `${siteUrl}/brand/logo-mark-selected.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: "Schulung Wimpernverlängerung",
        inLanguage: "de-DE",
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "Course",
        "@id": `${siteUrl}/#course`,
        name: COURSE.title,
        description,
        url: siteUrl,
        inLanguage: "de-DE",
        educationalLevel: COURSE.level,
        timeRequired: "PT7H",
        image: `${siteUrl}/opengraph-image`,
        provider: { "@id": `${siteUrl}/#organization` },
        hasCourseInstance: {
          "@type": "CourseInstance",
          "@id": `${siteUrl}/#course-instance`,
          courseMode: "online",
          courseWorkload: "PT7H",
          ...(offer ? { offers: offer } : {}),
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${siteUrl}/#faq`,
        mainEntity: FAQS.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Startseite",
            item: siteUrl,
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <LandingPage product={product} faqs={FAQS} />
    </>
  );
}
