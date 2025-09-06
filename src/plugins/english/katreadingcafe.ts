import { fetchApi } from '@libs/fetch';
import { Plugin } from '@typings/plugin';
import { FilterTypes, Filters } from '@libs/filterInputs';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';
import dayjs from 'dayjs';

class KatReadingCafePlugin implements Plugin.PluginBase {
    id = "katreadingcafe";
    name = "Kat Reading Cafe";
    icon = "src/en/katreadingcafe/icon.png";
    site = "https://katreadingarchive.me";
    version = "1.0.1";

    resolveUrl = (path: string) => {
        if (path.startsWith('http')) {
            return path;
        }
        return this.site + path;
    };

    filters: Filters = {
        order: {
            label: "Order by",
            value: "popular",
            options: [
                { label: "Default", value: "" }, { label: "A-Z", value: "title" },
                { label: "Z-A", value: "titlereverse" }, { label: "Latest Update", value: "update" },
                { label: "Latest Added", value: "latest" }, { label: "Popular", value: "popular" },
                { label: "Rating", value: "rating" },
            ],
            type: FilterTypes.Picker,
        },
        status: {
            label: "Status",
            value: "", 
            options: [
                { label: "All", value: "" }, { label: "Ongoing", value: "ongoing" },
                { label: "Hiatus", value: "hiatus" }, { label: "Completed", value: "completed" },
            ],
            type: FilterTypes.Picker,
        },
        typeF: { 
            label: "Type",
            value: [], 
            options: [
                { label: "Fan Fiction", value: "fan-fiction" }, { label: "Web Novel", value: "web-novel" },
                { label: "WIP", value: "wip" }, 
            ],
            type: FilterTypes.CheckboxGroup,
        },
        genre: {
            label: "Genre",
            value: [], 
            options: [
                { label: "Action", value: "action" }, { label: "Adult", value: "adult" },
                { label: "Adventure", value: "adventure" }, { label: "Comedy", value: "comedy" },
                { label: "Drama", value: "drama" }, { label: "Ecchi", value: "ecchi" },
                { label: "Fantasy", value: "fantasy" }, { label: "Gender Bender", value: "gender-bender" },
                { label: "Harem", value: "harem" }, { label: "Historical", value: "historical" },
                { label: "Horror", value: "horror" }, { label: "Martial Arts", value: "martial-arts" },
                { label: "Mature", value: "mature" }, { label: "MTL", value: "mtl" },
                { label: "Mystery", value: "mystery" }, { label: "Psychological", value: "psychological" },
                { label: "Romance", value: "romance" }, { label: "School Life", value: "school-life" },
                { label: "Sci-fi", value: "sci-fi" }, { label: "Seinen", value: "seinen" },
                { label: "Shoujo", value: "shoujo" }, { label: "Shoujo Ai", value: "shoujo-ai" },
                { label: "Slice of Life", value: "slice-of-life" }, { label: "Smut", value: "smut" },
                { label: "Supernatural", value: "supernatural" }, { label: "Tragedy", value: "tragedy" },
                { label: "WIP", value: "wip" }, { label: "Xianxia", value: "xianxia" },
                { label: "Xuanhuan", value: "xuanhuan" }, { label: "Yuri", value: "yuri" },
            ],
            type: FilterTypes.CheckboxGroup,
        },
    } satisfies Filters;

    async popularNovels(
        pageNo: number,
        { showLatestNovels, filters }: Plugin.PopularNovelsOptions<typeof this.filters>,
    ): Promise<Plugin.NovelItem[]> {
        let baseUrl = this.site + '/series/';
        let pagedUrl = baseUrl;
        if (pageNo > 1) {
            pagedUrl = baseUrl + `page/${pageNo}/`;
        }

        const params = new URLSearchParams();
        if (showLatestNovels) {
            params.append('order', 'update'); 
        } else if (filters.order.value) {
            params.append('order', filters.order.value);
        }
        
        if (filters.status.value) {
            params.append('status', filters.status.value);
        }
        
        const typeFFilterValue = filters.typeF?.value;
        if (Array.isArray(typeFFilterValue)) {
            typeFFilterValue.forEach(type => params.append('type[]', type));
        }

        const genreFilterValue = filters.genre?.value;
        if (Array.isArray(genreFilterValue)) {
            genreFilterValue.forEach(genre => params.append('genre[]', genre));
        }
        
        const queryString = params.toString();
        let finalUrl = pagedUrl;
        if (queryString) {
            finalUrl += '?' + queryString;
        }

        const result = await fetchApi(finalUrl);
        const body = await result.text();
        const $ = loadCheerio(body);

        const novels: Plugin.NovelItem[] = [];
        $('div.listupd article.maindet').each((i, element) => {
            const novelUrl = $(element).find('.mdthumb a').attr('href');
            const novelName = $(element).find('.mdinfo h2 a').text().trim();
            const novelCover = $(element).find('.mdthumb a img').attr('src');

            if (novelUrl && novelName) {
                 novels.push({
                    name: novelName,
                    path: new URL(novelUrl).pathname, 
                    cover: novelCover ? new URL(novelCover, this.site).href : defaultCover,
                });
            }
        });
        return novels;
    }

    async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
        const fullNovelUrl = this.resolveUrl(novelPath);
        const result = await fetchApi(fullNovelUrl);
        const body = await result.text();
        const $ = loadCheerio(body);
    
        const novel: Plugin.SourceNovel = {
            path: novelPath,
            name: $('h1.entry-title').text().trim() || "Untitled",
            cover: $('.sertothumb img').attr('src') ? new URL($('.sertothumb img').attr('src')!, this.site).href : defaultCover,
            author: null,
            artist: null,
            status: NovelStatus.Unknown,
            genres: $('.sertogenre a').map((i, el) => $(el).text().trim()).get().join(', '),
            summary: $('.sersys.entry-content').text().trim(),
            chapters: [],
        };

        $('.sertoinfo .sertoauth .serl').each(function () {
            const label = $(this).find('.sername').text().trim();
            const value = $(this).find('.serval').text().trim();

            if (label === 'Author') {
                novel.author = value || null; 
            }
        });
        
        const statusText = $('.sertostat span').text().trim().toLowerCase();
        switch (statusText) {
            case 'ongoing':
                novel.status = NovelStatus.Ongoing;
                break;
            case 'completed':
                novel.status = NovelStatus.Completed;
                break;
            case 'hiatus':
                novel.status = NovelStatus.OnHiatus;
                break;
        }
    
        const chapters: Plugin.ChapterItem[] = [];
        $('.eplister ul li').each((i, element) => {
            const chapterA = $(element).find('a');
            const chapterUrl = chapterA.attr('href');
            if (!chapterUrl) return;

            const numText = chapterA.find('.epl-num').text().trim(); 
            const titleText = chapterA.find('.epl-title').text().trim();
            const releaseTime = chapterA.find('.epl-date').text().trim();

            let chapterName = titleText ? `${numText} - ${titleText}` : numText;

            let parsedReleaseTime: string | null = null;
            if (releaseTime) {
                try {
                    parsedReleaseTime = dayjs(releaseTime, "MMMM D, YYYY").toISOString();
                } catch (e) {
                    parsedReleaseTime = releaseTime;
                }
            }
            
            let parsedChapterNumber: number | undefined = undefined;
            const chNumMatchSimple = numText.match(/Ch\.?\s*(\d+(\.\d+)?)/i);
            const chNumMatchVolume = numText.match(/Vol\.?\s*\d+\s*Ch\.?\s*(\d+(\.\d+)?)/i);

            let tempNumStr: string | undefined;
            if (chNumMatchVolume?.[1]) {
                tempNumStr = chNumMatchVolume[1];
            } else if (chNumMatchSimple?.[1]) {
                tempNumStr = chNumMatchSimple[1];
            }

            if (tempNumStr) {
                const num = parseFloat(tempNumStr);
                if (!isNaN(num)) {
                    parsedChapterNumber = num;
                }
            }

            chapters.push({
                name: chapterName,
                path: new URL(chapterUrl).pathname,
                releaseTime: parsedReleaseTime,
                chapterNumber: parsedChapterNumber,
            });
        });
    
        novel.chapters = chapters.reverse(); 
        return novel;
    }
    
    async parseChapter(chapterPath: string): Promise<string> {
        const fullChapterUrl = this.resolveUrl(chapterPath);
        const result = await fetchApi(fullChapterUrl);
        const body = await result.text();
        const $ = loadCheerio(body);
    
        const chapterContent = $('.epcontent.entry-content');
        
        if (!chapterContent.length) {
            return '';
        }
    
        chapterContent.find('h1').remove();
        chapterContent.find('.kofi-button-container, div[class*="kofi-"]').remove();
        chapterContent.find('center').filter((i, el) => $(el).find('a[href*="ko-fi.com"]').length > 0).remove();
        chapterContent.find('span[style*="height: 0"][style*="width: 0"]').remove();     
        chapterContent.contents().filter((_, node) => node.type === 'comment').remove();
    
        chapterContent.find('p').each((i, el) => {
            if ($(el).text().trim() === '' && $(el).children().length === 0) {
                $(el).remove();
            }
        });
        
        return chapterContent.html() || "";
    }

    async searchNovels(
        searchTerm: string, 
        pageNo: number
    ): Promise<Plugin.NovelItem[]> {
        let url = `${this.site}/?s=${encodeURIComponent(searchTerm)}`;
        if (pageNo > 1) {
            url = `${this.site}/page/${pageNo}/?s=${encodeURIComponent(searchTerm)}`;
        }
    
        const result = await fetchApi(url);
        const body = await result.text();
        const $ = loadCheerio(body);
    
        const novels: Plugin.NovelItem[] = [];
        $('div.listupd article.maindet').each((i, element) => {
            const novelUrl = $(element).find('.mdthumb a').attr('href');
            const novelName = $(element).find('.mdinfo h2 a').text().trim();
            const novelCover = $(element).find('.mdthumb a img').attr('src');

            if (novelUrl && novelName) {
                 novels.push({
                    name: novelName,
                    path: new URL(novelUrl).pathname,
                    cover: novelCover ? new URL(novelCover, this.site).href : defaultCover,
                });
            }
        });
        return novels;
    }
}
export default new KatReadingCafePlugin();
