export async function onRequest(context) {
    const { request } = context;
    const urlStr = request.url;
    const urlObj = new URL(urlStr);

    const ASSET_URL = 'https://scarlett518.github.io/gh-proxy/';
    const PREFIX = '/';
    const Config = { jsdelivr: 0 };
    const whiteList = [];

    const PREFLIGHT_INIT = {
        status: 204,
        headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
            'access-control-max-age': '1728000',
        },
    };

    const patterns = [
        /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i,
        /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i,
        /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i,
        /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+?\/.+$/i,
        /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i,
        /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i,
        /^(?:https?:\/\/)?api\.github\.com\/.*$/i,
        /^(?:https?:\/\/)?git\.io\/.*$/i,
        /^(?:https?:\/\/)?gitlab\.com\/.*$/i
    ];

    try {
        return await handleRequest(request);
    } catch (err) {
        return makeRes('Error:\n' + err.stack, 502);
    }

    function makeRes(body, status = 200, headers = {}) {
        headers['access-control-allow-origin'] = '*';
        return new Response(body, { status, headers });
    }

    function newUrl(urlStr) {
        try {
            return new URL(urlStr);
        } catch {
            return null;
        }
    }

    async function handleRequest(req) {
        let path = urlObj.searchParams.get('q');
        if (path) {
            return Response.redirect('https://' + urlObj.host + PREFIX + path, 301);
        }

        path = urlObj.href.substring(urlObj.origin.length + PREFIX.length);

        const exp0 = 'https:/' + urlObj.host + '/';
        while (path.startsWith(exp0)) {
            path = path.replace(exp0, '');
        }

        path = path.replace(/^https?:\/+/, 'https://');

        if (patterns.some(pattern => path.search(pattern) === 0)) {
            return handleHttpRequest(req, path);
        } else {
            return fetch(ASSET_URL + path);
        }
    }

    async function handleHttpRequest(req, pathname) {
        const reqHdrRaw = req.headers;

        if (req.method === 'OPTIONS' && reqHdrRaw.has('access-control-request-headers')) {
            return new Response(null, PREFLIGHT_INIT);
        }

        const reqHdrNew = new Headers(reqHdrRaw);
        let urlStr = pathname;

        if (!whiteList.length || whiteList.some(item => urlStr.includes(item))) {
            if (urlStr.startsWith('git')) {
                urlStr = 'https://' + urlStr;
            }

            const urlObj = newUrl(urlStr);
            const reqInit = {
                method: req.method,
                headers: reqHdrNew,
                redirect: 'manual',
                body: req.body
            };
            return proxy(urlObj, reqInit);
        } else {
            return new Response("Blocked", { status: 403 });
        }
    }

    async function proxy(urlObj, reqInit) {
        const res = await fetch(urlObj.href, reqInit);
        const resHdrOld = res.headers;
        const resHdrNew = new Headers(resHdrOld);

        if (resHdrNew.has('location')) {
            let location = resHdrNew.get('location');
            if (patterns.some(pattern => location.search(pattern) === 0)) {
                resHdrNew.set('location', PREFIX + location);
            } else {
                reqInit.redirect = 'follow';
                return proxy(newUrl(location), reqInit);
            }
        }

        resHdrNew.set('access-control-expose-headers', '*');
        resHdrNew.set('access-control-allow-origin', '*');
        resHdrNew.delete('content-security-policy');
        resHdrNew.delete('content-security-policy-report-only');
        resHdrNew.delete('clear-site-data');

        return new Response(res.body, { status: res.status, headers: resHdrNew });
    }
}
