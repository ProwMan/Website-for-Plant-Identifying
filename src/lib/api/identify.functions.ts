export type PlantSuggestion = {
  name: string;
  commonNames: string[];
  probability: number;
  thumbnail?: string;
  wikiUrl?: string;
};

const VULGARITIES = [
  "fuck", "shit", "ass", "bitch", "dick", "pussy", "bastard", "cunt", 
  "nigger", "faggot", "slut", "whore", "cock", "vagina", "anus",
  "asshole", "retard", "rape", "sex", "porn", "cum", "tit"
];

function containsProfanity(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return VULGARITIES.some(word => normalized.includes(word));
}

// Placeholder for GitHub Pages (Replace with your actual key before building)
const PLANTNET_API_KEY = "YOUR_PLANTNET_API_KEY_HERE";

export async function loginUserClient(fullName: string, className: string) {
  if (containsProfanity(fullName)) {
    throw new Error("Inappropriate name detected. Please use your real name.");
  }

  // Use Web Crypto API for client-side hashing
  const msgUint8 = new TextEncoder().encode(`${fullName.toLowerCase().trim()}-${className.toLowerCase().trim()}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const uid = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

  return { uid, displayName: `${fullName.trim()} (${className.trim()})` };
}

export async function identifyPlantClient(imageDataUrl: string): Promise<{ suggestions: PlantSuggestion[] }> {
  const match = imageDataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const mime = match[1];
  const b64 = match[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  
  const blob = new Blob([bytes], { type: mime });
  const form = new FormData();
  form.append("images", blob, "plant.jpg");
  form.append("organs", "auto");

  const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${PLANTNET_API_KEY}&include-related-images=true&lang=en`;

  const res = await fetch(url, { method: "POST", body: form });
  if (!res.ok) throw new Error("Plant identification failed.");

  const json = await res.json();
  const suggestions: PlantSuggestion[] = (json.results ?? [])
    .filter((r: any) => r.score >= 0.6)
    .slice(0, 3)
    .map((r: any) => ({
      name: r.species.scientificNameWithoutAuthor ?? r.species.scientificName ?? "Unknown",
      commonNames: r.species.commonNames ?? [],
      probability: r.score,
      thumbnail: r.images?.[0]?.url?.s ?? r.images?.[0]?.url?.m,
      wikiUrl: r.gbif?.id ? `https://www.gbif.org/species/${r.gbif.id}` : undefined,
    }));

  return { suggestions };
}
