import { config } from "dotenv";
config();
import app 
from "./app";



const main = async () => {
  
  app.listen(4000);
  console.log("Running a GraphQL API server at http://localhost:4000/graphql");
};

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});