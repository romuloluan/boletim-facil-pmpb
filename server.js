const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const PdfPrinter = require('pdfmake');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// --- 1. CONFIGURAÇÃO DE FONTES ---
const fontsDir = path.join(__dirname, 'fonts');

function encontrarArquivo(parteDoNome) {
    if (!fs.existsSync(fontsDir)) return null;
    const arquivos = fs.readdirSync(fontsDir);
    const arquivoEncontrado = arquivos.find(arquivo => 
        arquivo.toLowerCase().includes(parteDoNome.toLowerCase()) && 
        arquivo.toLowerCase().endsWith('.ttf')
    );
    return arquivoEncontrado ? path.join(fontsDir, arquivoEncontrado) : null;
}

const fontRegular = encontrarArquivo('Regular');
const fontBold = encontrarArquivo('Bold') || encontrarArquivo('Medium');
const fontItalic = encontrarArquivo('Italic');
const fontBoldItalic = encontrarArquivo('BoldItalic') || encontrarArquivo('MediumItalic');
const fallback = fs.existsSync(fontsDir) ? path.join(fontsDir, fs.readdirSync(fontsDir).find(f => f.endsWith('.ttf')) || '') : null;

const fonts = {
    Roboto: {
        normal: fontRegular || fallback,
        bold: fontBold || fontRegular || fallback,
        italics: fontItalic || fontRegular || fallback,
        bolditalics: fontBoldItalic || fontRegular || fallback
    }
};

const printer = new PdfPrinter(fonts);

// --- 2. FUNÇÕES AUXILIARES ---
function getImageBase64(filename) {
    const paths = [
        path.join(__dirname, 'public', 'assets', filename),
        path.join(__dirname, 'assets', filename)
    ];
    for (let p of paths) {
        if (fs.existsSync(p)) {
            try {
                const bitmap = fs.readFileSync(p);
                return 'data:image/png;base64,' + bitmap.toString('base64');
            } catch (e) { return null; }
        }
    }
    return null;
}

const toArray = (val) => {
    if (val === undefined || val === null) return [];
    return Array.isArray(val) ? val : [val];
};

function limparObjeto(obj) {
    if (Array.isArray(obj)) {
        return obj.filter(item => item !== undefined && item !== null).map(limparObjeto);
    } else if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
            obj[key] = limparObjeto(obj[key]);
        });
        return obj;
    }
    return obj;
}

// Layout de Tabela "EXCEL"
const tableLayout = {
    hLineWidth: function (i, node) { return 0.5; },
    vLineWidth: function (i, node) { return 0.5; },
    hLineColor: function (i, node) { return '#333'; },
    vLineColor: function (i, node) { return '#333'; },
    paddingLeft: function(i, node) { return 4; },
    paddingRight: function(i, node) { return 4; },
    paddingTop: function(i, node) { return 2; },
    paddingBottom: function(i, node) { return 2; }
};

const field = (label, value, colSpan = 1) => {
    return {
        stack: [
            { text: label.toUpperCase(), style: 'fieldLabel' },
            { text: (value || '').toUpperCase(), style: 'fieldValue' }
        ],
        colSpan: colSpan,
        style: 'fieldBox'
    };
};

const empty = (colSpan = 1) => ({ text: '', colSpan: colSpan });

// --- 3. ROTAS ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.post('/gerar-boletim', (req, res) => {
    try {
        console.log("📄 Gerando PDF (Layout Ficha Sem Solicitante)...");
        const dados = req.body || {};

        const imgPB = getImageBase64('logo_pb.png');
        const imgPM = getImageBase64('logo_pmpb.png');
        
        const guarnicoes = toArray(dados.guarnicoes).filter(g => g && (g.vtr || g.comandante));

        let content = [];

        // --- CABEÇALHO ---
        content.push({
            table: {
                widths: [60, '*', 60],
                body: [[
                    { image: imgPB || '', width: 50, alignment: 'center', border: [false, false, false, true] },
                    {
                        stack: [
                            { text: 'ESTADO DA PARAÍBA', style: 'headerSmall' },
                            { text: 'POLÍCIA MILITAR', style: 'headerLarge' },
                            { text: 'REGISTRO DE OCORRÊNCIA POLICIAL MILITAR', style: 'headerMedium' }
                        ],
                        alignment: 'center',
                        margin: [0, 5, 0, 0],
                        border: [false, false, false, true]
                    },
                    { image: imgPM || '', width: 50, alignment: 'center', border: [false, false, false, true] }
                ]]
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 5]
        });

        // --- 1. DADOS DA OCORRÊNCIA ---
        // Título integrado na tabela (como linha de cabeçalho)
        content.push({
            table: {
                widths: ['15%', '15%', '20%', '15%', '15%', '20%'],
                body: [
                    [{ text: '1. DADOS DA OCORRÊNCIA', style: 'sectionHeader', colSpan: 6, fillColor: '#003366' }, {}, {}, {}, {}, {}],
                    [
                        field('UNIDADE (OPM)', dados.unidade),
                        field('Nº CIOP', dados.ciop),
                        field('BOLETIM Nº', dados.num_boletim),
                        field('DATA', dados.data ? dados.data.split('-').reverse().join('/') : ''),
                        field('HORA', dados.hora),
                        field('CÓD. OCORRÊNCIA', dados.natureza ? '***' : '') 
                    ],
                    [field('NATUREZA DA OCORRÊNCIA', dados.natureza, 4), empty(0), empty(0), empty(0), field('CÓDIGO', dados.codigo_ocorrencia || '', 2), empty(0)],
                    [field('ENDEREÇO DO FATO', dados.endereco, 3), empty(0), empty(0), field('BAIRRO/CIDADE', dados.cidade_bairro, 3), empty(0), empty(0)],
                    [field('PONTO DE REFERÊNCIA', dados.referencia, 6), empty(0), empty(0), empty(0), empty(0), empty(0)]
                ]
            },
            layout: tableLayout,
            margin: [0, 0, 0, 5]
        });

        // --- 2. GUARNIÇÃO ---
        // Título como header da primeira tabela
        if (guarnicoes.length > 0) {
            guarnicoes.forEach((g, index) => {
                const componentes = toArray(g.patrulheiros).filter(p => p).join(' / ');
                // Se for a primeira guarnição, coloca o cabeçalho azul. Se não, só o cinza.
                const headerRow = index === 0 
                    ? [{ text: '2. GUARNIÇÃO POLICIAL', style: 'sectionHeader', colSpan: 3, fillColor: '#003366' }, {}, {}]
                    : [{ text: `GUARNIÇÃO ${index + 1} (APOIO)`, colSpan: 3, fillColor: '#eee', style: 'subHeader' }, {}, {}];

                content.push({
                    table: {
                        widths: ['15%', '35%', '50%'],
                        body: [
                            headerRow,
                            index === 0 ? [{ text: `GUARNIÇÃO ${index + 1}`, colSpan: 3, fillColor: '#eee', style: 'subHeader' }, {}, {}] : [], // Linha subheader extra para a primeira
                            [field('PREFIXO VTR', g.vtr), field('COMANDANTE', g.comandante), field('MOTORISTA', g.motorista)],
                            [field('PATRULHEIROS / COMPONENTES', componentes, 3), empty(0), empty(0)]
                        ].filter(row => row.length > 0) // Remove linhas vazias
                    },
                    layout: tableLayout,
                    margin: [0, 0, 0, 2]
                });
            });
        } else {
             content.push({
                table: {
                    widths: ['*'],
                    body: [
                        [{ text: '2. GUARNIÇÃO POLICIAL', style: 'sectionHeader', fillColor: '#003366' }],
                        [{ text: 'Nenhuma guarnição informada.', fontSize: 9 }]
                    ]
                },
                layout: tableLayout,
                margin: [0, 0, 0, 5]
            });
        }

        // --- 3. ENVOLVIDOS ---
        const renderPerson = (tipo, nome, index, dadosArrays, isFirstOfSection) => {
            const prefix = tipo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const getVal = (key) => toArray(dadosArrays[key])[index] || '';
            
            let rows = [];
            
            // Se for o primeiro envolvido de todos, adiciona o cabeçalho azul da seção
            if (isFirstOfSection) {
                 rows.push([{ text: '3. ENVOLVIDOS', style: 'sectionHeader', colSpan: 6, fillColor: '#003366' }, {}, {}, {}, {}, {}]);
            }

            rows.push(
                [
                    { text: `${tipo} 0${index + 1}`, style: 'personType', fillColor: '#e0e0e0', alignment: 'center' },
                    field('NOME COMPLETO', nome, 3), empty(0), empty(0),
                    field('ALCUNHA (APELIDO)', getVal(`${prefix}_alcunha`), 2), empty(0)
                ],
                [field('NOME DA MÃE', getVal(`${prefix}_mae`), 6), empty(0), empty(0), empty(0), empty(0), empty(0)],
                [
                    field('DATA NASC.', getVal(`${prefix}_nasc`) ? getVal(`${prefix}_nasc`).split('-').reverse().join('/') : ''),
                    field('RG / ÓRGÃO', getVal(`${prefix}_rg`)),
                    field('CPF', getVal(`${prefix}_cpf`)),
                    field('CNH', getVal(`${prefix}_cnh`)),
                    field('TELEFONE', getVal(`${prefix}_tel`)),
                    field('PROFISSÃO', getVal(`${prefix}_profissao`))
                ],
                [field('ENDEREÇO COMPLETO', getVal(`${prefix}_endereco`), 4), empty(0), empty(0), empty(0), field('PONTO DE REFERÊNCIA', getVal(`${prefix}_referencia`), 2), empty(0)]
            );

            if (prefix === 'acusado') {
                rows.push([
                    field('PELE', getVal(`${prefix}_pele`)), field('OLHOS', getVal(`${prefix}_olhos`)),
                    field('CABELO', getVal(`${prefix}_cabelo`)), field('ALTURA', getVal(`${prefix}_altura`)),
                    field('COMPLEIÇÃO', getVal(`${prefix}_compleicao`), 2), empty(0)
                ]);
                rows.push([field('SINAIS / MARCAS / TATUAGENS', `${getVal(`${prefix}_marcas`)} - ${getVal(`${prefix}_marcas_desc`)}`, 6), empty(0), empty(0), empty(0), empty(0), empty(0)]);
            }

            return {
                table: { widths: ['10%', '25%', '15%', '15%', '15%', '20%'], body: rows },
                layout: tableLayout,
                margin: [0, 0, 0, 2]
            };
        };

        // Renderiza Pessoas
        let firstEnvolvido = true;
        toArray(dados.vitima_nome).forEach((nome, i) => { content.push(renderPerson('VÍTIMA', nome, i, dados, firstEnvolvido)); firstEnvolvido = false; });
        toArray(dados.acusado_nome).forEach((nome, i) => { content.push(renderPerson('ACUSADO', nome, i, dados, firstEnvolvido)); firstEnvolvido = false; });
        toArray(dados.testemunha_nome).forEach((nome, i) => { content.push(renderPerson('TESTEMUNHA', nome, i, dados, firstEnvolvido)); firstEnvolvido = false; });

        if (firstEnvolvido) { // Ninguém adicionado
             content.push({
                table: { widths: ['*'], body: [[{ text: '3. ENVOLVIDOS', style: 'sectionHeader', fillColor: '#003366' }], [{text: 'Nenhum envolvido registrado.', fontSize: 9}]] },
                layout: tableLayout, margin: [0, 0, 0, 5]
            });
        }

        // --- 4. APREENSÕES ---
        const temArmas = toArray(dados.arma_tipo).length > 0;
        const temCartuchos = toArray(dados.cartucho_qtd).length > 0;
        const temObjetos = toArray(dados.obj_descricao).length > 0;

        if (temArmas || temCartuchos || temObjetos) {
            // Tabela mestre de apreensões
            const rowsApreensoes = [];
            rowsApreensoes.push([{ text: '4. APREENSÕES', style: 'sectionHeader', colSpan: 4, fillColor: '#003366' }, {}, {}, {}]);

            if (temArmas) {
                // CORRIGIDO: Linha de Título Cinza DENTRO da tabela
                rowsApreensoes.push([{ text: 'ARMA(S) DE FOGO APREENDIDA(S)', style: 'subHeader', colSpan: 4, fillColor: '#f0f0f0' }, {}, {}, {}]);
                rowsApreensoes.push([{ text: 'TIPO', style: 'tableHeader' }, { text: 'MARCA/MODELO', style: 'tableHeader' }, { text: 'CALIBRE', style: 'tableHeader' }, { text: 'SÉRIE', style: 'tableHeader' }]);
                
                toArray(dados.arma_tipo).forEach((tipo, i) => {
                    rowsApreensoes.push([
                        { text: (tipo || '').toUpperCase(), style: 'cell' },
                        { text: (toArray(dados.arma_modelo)[i] || '').toUpperCase(), style: 'cell' },
                        { text: (toArray(dados.arma_calibre)[i] || '').toUpperCase(), style: 'cell' },
                        { text: (toArray(dados.arma_serie)[i] || '').toUpperCase(), style: 'cell' }
                    ]);
                });
            }

            if (temCartuchos) {
                // CORRIGIDO: Linha de Título Cinza
                rowsApreensoes.push([{ text: 'CARTUCHO(S) APREENDIDO(S)', style: 'subHeader', colSpan: 4, fillColor: '#f0f0f0' }, {}, {}, {}]);
                rowsApreensoes.push([{ text: 'QTD', style: 'tableHeader' }, { text: 'CALIBRE', style: 'tableHeader' }, { text: 'TIPO', style: 'tableHeader', colSpan: 2 }, {}]);
                
                toArray(dados.cartucho_qtd).forEach((qtd, i) => {
                    rowsApreensoes.push([
                        { text: (qtd || '').toUpperCase(), style: 'cell' },
                        { text: (toArray(dados.cartucho_calibre)[i] || '').toUpperCase(), style: 'cell' },
                        { text: (toArray(dados.cartucho_tipo)[i] || '').toUpperCase(), style: 'cell', colSpan: 2 }, {}
                    ]);
                });
            }

            if (temObjetos) {
                // CORRIGIDO: Linha de Título Cinza
                rowsApreensoes.push([{ text: 'OUTRO(S) OBJETO(S) APREENDIDO(S)', style: 'subHeader', colSpan: 4, fillColor: '#f0f0f0' }, {}, {}, {}]);
                rowsApreensoes.push([{ text: 'QTD', style: 'tableHeader' }, { text: 'DESCRIÇÃO DO MATERIAL', style: 'tableHeader', colSpan: 3 }, {}, {}]);
                
                toArray(dados.obj_descricao).forEach((desc, i) => {
                    rowsApreensoes.push([
                        { text: (toArray(dados.obj_qtd)[i] || '1').toUpperCase(), style: 'cell' },
                        { text: (desc || '').toUpperCase(), style: 'cell', colSpan: 3 }, {}, {}
                    ]);
                });
            }

            content.push({
                table: { widths: ['*', '*', '15%', '*'], body: rowsApreensoes },
                layout: tableLayout,
                margin: [0, 0, 0, 5]
            });
        }

        // --- 5. HISTÓRICO ---
        // CORRIGIDO: Título inserido na primeira linha da tabela (fundo azul)
        content.push({
            table: {
                widths: ['*'],
                body: [
                    [{ text: '5. RELATO DA OCORRÊNCIA', style: 'sectionHeader', fillColor: '#003366' }],
                    [{ text: (dados.historico || '').toUpperCase(), style: 'historicoText', minHeight: 120 }]
                ]
            },
            layout: tableLayout,
            margin: [0, 0, 0, 5]
        });

        // --- AUTO DE RESISTÊNCIA ---
        if (dados.ar_acusado_nome) {
            // CORRIGIDO: Título inserido na primeira linha da tabela (fundo vermelho)
            content.push({
                table: {
                    widths: ['*'],
                    body: [
                        [{ text: 'AUTO DE RESISTÊNCIA À PRISÃO', style: 'sectionHeaderRed', fillColor: '#8b0000' }],
                        [{
                            text: [
                                'No exercício legal de minha função policial, abordei e dei voz de prisão ao acusado ',
                                { text: (dados.ar_acusado_nome || '').toUpperCase(), bold: true },
                                ', por ter encontrado o mesmo em flagrante delito e/ou contravenção penal de ',
                                { text: (dados.ar_infracao || '').toUpperCase(), bold: true },
                                ' e, porque o infrator não obedecesse, antes resistisse à prisão, foi necessário o uso da força através de ',
                                { text: (dados.ar_meios || '').toUpperCase(), bold: true },
                                ', moderada e progressivamente, para vencer tal resistência, do que resultou: ',
                                { text: (dados.ar_resultado || '').toUpperCase(), bold: true },
                                '.'
                            ],
                            style: 'historicoText'
                        }]
                    ]
                },
                layout: tableLayout
            });
            content.push({
                table: {
                    widths: ['50%', '50%'],
                    body: [[
                        field('TESTEMUNHA 01 (AR)', dados.ar_testemunha1),
                        field('TESTEMUNHA 02 (AR)', dados.ar_testemunha2)
                    ]]
                },
                layout: tableLayout,
                margin: [0, 2, 0, 0]
            });
        }

        // --- 6. TERMO DE ENTREGA ---
        content.push({
            table: {
                widths: ['20%', '20%', '*'],
                body: [
                    [{ text: '6. TERMO DE ENTREGA / RECEBIMENTO', style: 'sectionHeader', colSpan: 3, fillColor: '#003366' }, {}, {}],
                    [
                        field('DATA', dados.entrega_data ? dados.entrega_data.split('-').reverse().join('/') : ''),
                        field('HORA', dados.entrega_hora),
                        field('RECEBEDOR (DELEGADO/AGENTE)', dados.entrega_recebedor)
                    ]
                ]
            },
            layout: tableLayout
        });

        content.push({
            columns: [
                { text: '\n\n____________________________________________\nASSINATURA DO CONDUTOR', alignment: 'center', fontSize: 8 },
                { text: '\n\n____________________________________________\nASSINATURA DO RECEBEDOR', alignment: 'center', fontSize: 8 }
            ],
            margin: [0, 20, 0, 0]
        });

        // --- CONFIGURAÇÃO FINAL ---
        let docDefinition = {
            pageSize: 'A4',
            pageMargins: [20, 20, 20, 20], 
            
            // BORDA EXTERNA
            background: function(currentPage, pageSize) {
                return [
                    {
                        canvas: [
                            {
                                type: 'rect',
                                x: 10, y: 10, 
                                w: pageSize.width - 20,
                                h: pageSize.height - 20,
                                lineWidth: 1,
                                lineColor: '#000000'
                            }
                        ]
                    }
                ];
            },

            content: content,
            styles: {
                headerLarge: { fontSize: 14, bold: true, alignment: 'center', color: '#003366' },
                headerMedium: { fontSize: 10, bold: true, alignment: 'center', color: '#003366' },
                headerSmall: { fontSize: 8, alignment: 'center' },
                sectionHeader: { fontSize: 10, bold: true, fillColor: '#003366', color: 'white', alignment: 'center', margin: [0, 0, 0, 0] },
                sectionHeaderRed: { fontSize: 10, bold: true, fillColor: '#8b0000', color: 'white', alignment: 'center', margin: [0, 0, 0, 0] },
                subHeader: { fontSize: 9, bold: true, color: '#000', margin: [2, 2] },
                fieldLabel: { fontSize: 6, bold: true, color: '#444', margin: [0, -2, 0, 0] },
                fieldValue: { fontSize: 8, color: '#000', bold: true },
                personType: { fontSize: 7, bold: true, margin: [0, 10] },
                tableHeader: { fontSize: 7, bold: true, fillColor: '#eee', alignment: 'center' },
                cell: { fontSize: 8 },
                historicoText: { fontSize: 9, alignment: 'justify', lineHeight: 1.2 }
            },
            defaultStyle: { font: 'Roboto' }
        };

        docDefinition = limparObjeto(docDefinition);

        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=ROPM_${dados.num_boletim || 'Gerado'}.pdf`);
        pdfDoc.pipe(res);
        pdfDoc.end();

    } catch (error) {
        console.error("ERRO:", error);
        res.status(500).send("Erro ao gerar PDF: " + error.message);
    }
});

app.listen(PORT, () => console.log(`✅ Servidor rodando em http://localhost:${PORT}`));