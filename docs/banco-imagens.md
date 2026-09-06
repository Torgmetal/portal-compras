# Banco de imagens e vídeos

O acervo tratado reúne 41 fotos únicas, 12 vídeos completos e 12 cortes. Os arquivos são servidos pelo Blob; o catálogo está em `lib/acervo-torg.json`. O banco existente de fotos de obras continua em FotoObra. A API autenticada `/api/fotos` entrega as duas fontes separadas.

Nas apresentações ao cliente, use **Do banco** para a capa ou **Fotos e vídeos do banco** para o portfólio. Há também uma consulta do acervo na tela de apresentações. Na configuração do portal da obra, **Escolher do banco** troca a capa e **do banco** adiciona registros à galeria. Relatórios continuam aceitando somente fotos. Cada portal conserva sua seleção; importar mídia não altera automaticamente nenhum portal.

A galeria permite navegar, iniciar/pausar uma apresentação de fotos e assistir aos vídeos com controles. Vídeos não iniciam automaticamente e usam preload=none. As miniaturas do seletor carregam sob demanda. A seleção para o portal respeita o limite já existente de 24 registros.

## Tratamento

Tratamento tradicional autorizado, sem reconstrução por IA: correção discreta de luminosidade, contraste e saturação, com nitidez leve. As fotos preservam proporção e dimensões originais nas matrizes JPEG; a versão WebP tem lado maior limitado a 1920 pixels, sem ampliação. Vídeos conservam enquadramento e resolução, convertidos para H.264 com início de reprodução otimizado. Completos preservam o áudio original; cortes de aproximadamente 5 a 8 segundos são silenciosos e têm fade curto nas extremidades.

Os originais foram verificados por SHA-256. Matrizes, derivados, mapas de origem e ensaios ficam em `output/banco-midias/`, fora do Git. O ensaio generativo inicial foi rejeitado e não pertence ao acervo publicado.

Scripts `scripts/banco-midias/tratar.py`, `tratar-videos.py` e `publicar.mjs` registram o processo. Os scripts de tratamento usam Pillow e imageio-ffmpeg; o upload usa BLOB_READ_WRITE_TOKEN sem expor o token. O checkpoint de upload evita duplicação numa retomada. Os nomes descrevem apenas o conteúdo visível; nenhuma OP ou cliente foi deduzido dos arquivos.

Validação: 4 testes de seleção e galeria, conferência visual das folhas de contato, decodificação dos 24 vídeos, integridade dos originais e verificação dos links enviados.
