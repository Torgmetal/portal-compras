// TORG — preenche os UDAs de cliente (SKU, TAG, CWP, Item LX, desenho) nas MONTAGENS do modelo
// a partir de mapeamento-sku.csv (marca;sku;tag;cwp;item_lx;desenho_cliente), casando pela
// marca de montagem (ASSEMBLY_POS, ex.: T107A1). Tekla Structures 2025, Open API.
//
// Como usar: copie para ..\Environments\common\macros\modeling\ (ou a pasta de macros do seu
// ambiente), abra o modelo, Applications & components > Macros > TORG_TMSA_PreencherUDA > Run.
// O CSV e lido da pasta do modelo. Gera TORG_TMSA_resultado.txt na mesma pasta com o que casou
// e o que ficou sem par. Nao renumera nada: so grava atributos.
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using Tekla.Structures.Model;

namespace Tekla.Technology.Akit.UserScript
{
    public class Script
    {
        public static void Run(Tekla.Technology.Akit.IScript akit)
        {
            var model = new Model();
            if (!model.GetConnectionStatus()) { Console.WriteLine("Tekla sem modelo aberto."); return; }
            string pasta = model.GetInfo().ModelPath;
            string csv = Path.Combine(pasta, "mapeamento-sku.csv");
            if (!File.Exists(csv)) { Console.WriteLine("Nao achei " + csv); return; }

            var mapa = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
            foreach (var linha in File.ReadAllLines(csv, Encoding.UTF8))
            {
                if (string.IsNullOrWhiteSpace(linha) || linha.StartsWith("marca;")) continue;
                var c = linha.Split(';');
                if (c.Length < 2) continue;
                mapa[c[0].Trim()] = c;
            }

            var log = new StringBuilder();
            int casadas = 0, semPar = 0;
            var vistas = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var sel = model.GetModelObjectSelector().GetAllObjectsWithType(ModelObject.ModelObjectEnum.ASSEMBLY);
            while (sel.MoveNext())
            {
                var asm = sel.Current as Assembly;
                if (asm == null) continue;
                string marca = "";
                asm.GetReportProperty("ASSEMBLY_POS", ref marca);
                if (string.IsNullOrEmpty(marca)) continue;
                string[] c;
                if (!mapa.TryGetValue(marca, out c)) { semPar++; continue; }
                vistas.Add(marca);
                Grava(asm, "SKU_TMSA", c, 1);
                Grava(asm, "TAG_CLIENTE", c, 2);
                Grava(asm, "CWP_CLIENTE", c, 3);
                Grava(asm, "ITEM_LX", c, 4);
                Grava(asm, "DESENHO_CLIENTE", c, 5);
                asm.Modify();
                casadas++;
                log.AppendLine("OK   " + marca + " -> " + c[1]);
            }
            model.CommitChanges();
            foreach (var m in mapa.Keys) if (!vistas.Contains(m)) log.AppendLine("CSV sem montagem no modelo: " + m);
            log.Insert(0, "Montagens casadas: " + casadas + " | sem par no CSV: " + semPar + " | " + DateTime.Now + "\r\n");
            File.WriteAllText(Path.Combine(pasta, "TORG_TMSA_resultado.txt"), log.ToString(), Encoding.UTF8);
            Console.WriteLine(log.ToString());
        }

        static void Grava(Assembly asm, string uda, string[] c, int i)
        {
            if (c.Length > i && !string.IsNullOrWhiteSpace(c[i])) asm.SetUserProperty(uda, c[i].Trim());
        }
    }
}
