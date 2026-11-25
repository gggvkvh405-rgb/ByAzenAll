using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        bool exportOnly = args.Length == 1 && args[0] == "--export-only";
        try
        {
            string directory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "ByAzen", "Offline");
            Directory.CreateDirectory(directory);
            string page = Path.Combine(directory, "index.html");
            string temporary = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");
            try
            {
                using (Stream content = Assembly.GetExecutingAssembly().GetManifestResourceStream("ByAzen.OfflineHtml"))
                {
                    if (content == null) throw new InvalidOperationException("Embedded application page is missing.");
                    using (FileStream output = File.Create(temporary)) content.CopyTo(output);
                }
                if (File.Exists(page)) File.Replace(temporary, page, null);
                else File.Move(temporary, page);
            }
            finally
            {
                File.Delete(temporary);
            }

            if (!exportOnly) Process.Start(new ProcessStartInfo(page) { UseShellExecute = true });
            return 0;
        }
        catch (Exception error)
        {
            if (!exportOnly)
            {
                MessageBox.Show("Не удалось открыть ByAzen в браузере.\n\n" + error.Message,
                    "ByAzen", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            return 1;
        }
    }
}
