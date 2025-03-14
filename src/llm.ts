import { PromptTemplate } from "@langchain/core/prompts";
import type {
  SuppliesData,
  InventoryData,
} from "./types/tables";

// load enviroment variables
// const GoogleAIAPIKey = Deno.env.get("GOOGLE_AI_API_KEY");
import dotenv from "dotenv";
dotenv.config();
const GoogleAIAPIKey = process.env.GOOGLE_AI_API_KEY;

if (!GoogleAIAPIKey) {
  throw new Error("Google AI API Key must be provided");
}

// init db
import supabaseController from "./db";

// init gemini
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
const llm = new ChatGoogleGenerativeAI({
  modelName: "gemini-1.5-pro", // or "gemini-pro-vision" for image inputs
  apiKey: GoogleAIAPIKey,
});

// base prompts
const idConverterPromptContent = `
Answer the question only based on the context.
Your task is to match as closely as possible, the medication from the input to an item from the context.
The id should be the number next to the medication name in the context.

Your output should only consist of the id number.
If the medication is not found in the context, return "0".

### Example:
**User Input:** "How much Benadril do we have in stock?"
**Transformed Output:** "2"

Context: {context}

Input: {input}
Assistant:
`;

const inventoryPromptContent = `
Only Answer using the context and data from the database.

Relay all information that is relevant but only relevant information to the input.


Use quantity for quantity.
Use length for amount of packages.

Use location for location.
Use type for type
Use quantity_in_pack for cap.
Use name for corrected name
Use strength_or_volume for strength/volume
Use route_of_use for route
Use possible_side_effects for possible side effects

Context:
{context}

### Example:
**User Input:** "How much Benadril do we have in stock?"
**Output:** "There is 69 capsules over 2 packages with a cap of 60 capsules per package of Diphenhydramine (Benadryl) in stock?"

Input: {input}
Assistant:
`;

// prompt templates
const idConverterPromptTemplate = new PromptTemplate({
  template: idConverterPromptContent,
  inputVariables: ["input", "context"],
});
const inventoryPromptTemplate = new PromptTemplate({
  template: inventoryPromptContent,
  inputVariables: ["input", "context"],
});

// chains
const idConverterChain = idConverterPromptTemplate.pipe(llm);
const inventoryChain = inventoryPromptTemplate.pipe(llm);

const getInventoryInformation = async (question: string): Promise<string> => {
  const suppliesResponse = await supabaseController.readDeletableDataFromTable(
    "supplies",
    { itemsPerPage: 100, page: 1, keywords: "" },
    ["id", "name"]
  );
  const suppliesTable = suppliesResponse.current.data;
  const response = await idConverterChain.invoke({
    input: question,
    context: suppliesTable,
  });
  const supplyId = parseInt(response.content.toString());
  if (supplyId === 0) {
    return "Please Try Again. No Medication Found.";
  }

  const supplyRow: Partial<SuppliesData>[] = await supabaseController.readRowsFromTable("supplies", "id", [supplyId], ["type", "name", "strength_or_volume", "route_of_use", "quantity_in_pack", "possible_side_effects", "location"]);
  const inventoryRows: Partial<InventoryData>[] = await supabaseController.readRowsFromTable(
    "inventory",
    "supply_id",
    [supplyId],
    ["quantity"]
  );
  const totalQuantity = inventoryRows.reduce(
    (total, item) => total + (item.quantity ?? 0),
    0
  );
  const context = JSON.stringify({
    quantity: totalQuantity,
    length: inventoryRows.length,
    location: supplyRow[0].location,
    type: supplyRow[0].type,
    quantity_in_pack: supplyRow[0].quantity_in_pack,
    name: supplyRow[0].name,
    strength_or_volume: supplyRow[0].strength_or_volume,
    route_of_use: supplyRow[0].route_of_use,
    possible_side_effects: supplyRow[0].possible_side_effects,
  });
  const response2 = await inventoryChain.invoke({
    input: question,
    context: context,
  });
  return response2.content.toString();
};

export { getInventoryInformation };

if (require.main === module) {
  console.log(getInventoryInformation("How much Benadril do we have in stock?"));
}
