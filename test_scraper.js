const cheerio = require('cheerio');

// HTML real do site (secção relevante)
const html = `
<div class="row mb-5">
    <div class="col-md-12">
        <div class="card"><div class="card-header">Pesquisa</div></div>
    </div>
</div>
<div class="row mb-5">
    <div class="col-md-12">
        <div class="row padding-cover">
            <div class="descricao col-lg-7 col-md-12">
                <h3 class="title no-margin"><a href="/legendas?t=nome&s=War+Machine">War Machine</a></h3>
            </div>
            <div class="col-lg-5 col-md-12">
                <div class="row no-gutters align-items-center">
                    <div class="col-xl-6 col-lg-12 col-4">
                        <div class="text-lg-right mb-xl-4 mt-xl-4 mt-0 mb-2">
                            <a target="_blank" href="https://www.imdb.com/title/tt15940132"><img style="width: 40px;" src="https://pipocas.tv/img/imdb.png" alt="IMDB"></a>
                            <img style="width: 40px;" src="https://pipocas.tv/img/flag-brazil.png" alt="Brazil">
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="card">
            <div class="card-block">
                <div class="container mb-2">
                    <div class="row">
                        <div class="col pl-3 pl-lg-0">
                            <div class="row">
                                <div class="col-12 mt-2">
                                    <h3 class="title" style="word-break: break-all;">Release: <span class="font-normal">War.Machine.2026.1080p.WEB.h264-ETHEL</span></h3>
                                </div>
                                <div class="col-12 mt-4">
                                    <div class="row">
                                        <div class="col-sm-6 col-lg-12 border-left-legendas">
                                            <div class="row">
                                                <div class="col-10 offset-1 col-sm-12 offset-sm-0 col-lg-3 border-left-legendas">
                                                    <div class="info-detalhes px-3 py-2">
                                                        <a href="https://pipocas.tv/legendas/download/238630" class="dark-text">
                                                            <div class="row btn-yellow p-0 no-shadow">
                                                                <div class="col-8 pt-2 pb-2">
                                                                    <p class="m-0"><b>Descarregar</b></p>
                                                                </div>
                                                            </div>
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
`;

const $ = cheerio.load(html);

console.log('--- Teste de seletores ---\n');

// Testar seletor de download links
const downloadLinks = $('a[href*="/legendas/download/"]');
console.log(`Links de download encontrados: ${downloadLinks.length}`);
downloadLinks.each((i, el) => {
    const href = $(el).attr('href');
    const subId = href.match(/\/legendas\/download\/(\d+)/)?.[1];
    const block = $(el).closest('.row.mb-5');
    
    // Release
    const release = block.find('h3 .font-normal').first().text().trim();
    
    // Título
    const title = block.find('.descricao h3 a').first().text().trim();
    
    // Idioma
    let lang = 'PT';
    block.find('img[src*="flag-"]').each((_, flag) => {
        const src = $(flag).attr('src') || '';
        if (src.includes('flag-brazil')) lang = 'BR';
        else if (src.includes('flag-portugal')) lang = 'PT';
    });
    
    console.log(`\nLegenda #${i+1}:`);
    console.log(`  ID: ${subId}`);
    console.log(`  URL: ${href}`);
    console.log(`  Título: ${title}`);
    console.log(`  Release: ${release}`);
    console.log(`  Idioma: ${lang}`);
});
