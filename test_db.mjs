
import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: "postgresql://postgres:vrima01542020@db.yulcdxvlrbdtqztxyhel.supabase.co:5432/postgres"
});

async function run() {
  try {
    await client.connect();
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
    console.log("Connected successfully! Tables in public schema:");
    console.table(res.rows);
  } catch (err) {
    console.error("Connection failed:", err.message);
  } finally {
    await client.end();
  }
}
run();

