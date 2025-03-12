import { getInventoryInformation } from "./llm";

const main = async () => {
  const supplies_table = await getInventoryInformation("How much Zoloft do we have in stock?");
  console.log(supplies_table);
}

main()