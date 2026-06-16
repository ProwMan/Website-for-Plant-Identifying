import { db } from "./src/lib/firebase";
import { collection, addDoc } from "firebase/firestore";

const sampleDiscoveries = [
  {
    student: "John Doe (1.01)",
    scientificName: "Hibiscus rosa-sinensis",
    commonName: "Hibiscus",
    points: 10,
    confidence: 0.95,
    foundAt: new Date().toISOString(),
    userId: "sample-user-1",
  },
  {
    student: "Jane Smith (2.12)",
    scientificName: "Adiantum capillus-veneris",
    commonName: "Maidenhair Fern",
    points: 10,
    confidence: 0.88,
    foundAt: new Date().toISOString(),
    userId: "sample-user-2",
  },
];

async function seed() {
  console.log("Seeding sample data...");
  for (const discovery of sampleDiscoveries) {
    await addDoc(collection(db, "discoveries"), discovery);
  }
  console.log("Seeding complete!");
}

seed().catch(console.error);
