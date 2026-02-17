using System;
using System.Threading.Tasks;
using Geotab.Checkmate;
using Geotab.Checkmate.ObjectModel;
using System.Text.Json;

class Program
{
    const string Database = "demo_fleetclaim";
    const string Username = "fc_integration";
    const string Password = "Incident87d60490Report2026!";
    const string AddInId = "1de32f8e-8401-4df2-930e-8751f2d66ba7";

    static async Task Main()
    {
        Console.WriteLine("Creating API connection...");
        var api = new API(Username, Password, null, Database, "my.geotab.com");
        
        Console.WriteLine("Authenticating...");
        await api.AuthenticateAsync();
        Console.WriteLine("✅ Authenticated!");

        Console.WriteLine("\nTrying to add AddInData...");
        try
        {
            var entity = new
            {
                addInId = AddInId,
                details = new { type = "test", payload = new { message = "Hello from .NET", ts = DateTime.UtcNow.ToString("o") } }
            };
            
            var result = await api.CallAsync<object>("Add", typeof(AddInData), new { entity });
            Console.WriteLine($"✅ Added: {result}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Error: {ex.GetType().Name}: {ex.Message}");
            if (ex.InnerException != null)
                Console.WriteLine($"   Inner: {ex.InnerException.Message}");
        }

        Console.WriteLine("\nTrying to read AddInData...");
        try
        {
            var results = await api.CallAsync<object[]>("Get", typeof(AddInData), new { search = new { addInId = AddInId } });
            Console.WriteLine($"✅ Read {results?.Length ?? 0} records");
            if (results?.Length > 0)
            {
                Console.WriteLine($"   First record: {JsonSerializer.Serialize(results[0])}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"❌ Error: {ex.GetType().Name}: {ex.Message}");
        }

        Console.WriteLine("\nDone!");
    }
}
