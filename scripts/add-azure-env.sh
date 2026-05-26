#!/bin/bash
ENV_FILE="/Users/vitorcosta/Desktop/Claude Test/portal-compras/.env.local"

echo ""
echo "============================================"
echo "  Adicionar credenciais Azure ao .env.local"
echo "============================================"
echo ""
echo "Abra o Vercel → Environment Variables → clique em cada variavel"
echo "Copie o VALOR e cole aqui quando pedir."
echo ""

read -p "Cole o valor de AZURE_TENANT_ID: " TENANT
read -p "Cole o valor de AZURE_CLIENT_ID: " CLIENT
read -p "Cole o valor de AZURE_CLIENT_SECRET: " SECRET
read -p "Cole o valor de SHAREPOINT_DRIVE_ID: " DRIVE

# Remove linhas vazias anteriores dessas vars
grep -v "^AZURE_\|^SHAREPOINT_DRIVE_ID" "$ENV_FILE" > "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"

# Adiciona as novas
cat >> "$ENV_FILE" << EOF
AZURE_TENANT_ID="$TENANT"
AZURE_CLIENT_ID="$CLIENT"
AZURE_CLIENT_SECRET="$SECRET"
SHAREPOINT_DRIVE_ID="$DRIVE"
EOF

echo ""
echo "Pronto! Variaveis adicionadas ao .env.local"
echo ""
