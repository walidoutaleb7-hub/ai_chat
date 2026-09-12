export default async function handler(req, res) {
    // السماح بـ POST فقط
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    // التأكد من وجود مفتاح API
    if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
            error: "OPENAI_API_KEY is missing"
        });
    }

    try {
        const body = req.body || {};

        const message =
            typeof body.message === "string"
                ? body.message.trim()
                : "";

        if (!message) {
            return res.status(400).json({
                error: "Message is required"
            });
        }

        const response = await fetch(
            "https://api.openai.com/v1/responses",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                    "Authorization":
                        `Bearer ${process.env.OPENAI_API_KEY}`
                },

                body: JSON.stringify({
                    model: "gpt-5.6-luna",

                    /*
                     * 🔥 WEURA AI WEB SEARCH
                     * يسمح للذكاء الاصطناعي بالبحث في الإنترنت
                     * عندما يحتاج السؤال إلى معلومات حديثة.
                     */
                    tools: [
                        {
                            type: "web_search"
                        }
                    ],

                    instructions: `
أنت WEURA AI، مساعد ذكاء اصطناعي ذكي وودود.

القواعد الأساسية:

- أجب بنفس لغة المستخدم.
- تدعم العربية، الدارجة الجزائرية، الفرنسية والإنجليزية.
- كن دقيقًا ولا تخترع المعلومات.
- افهم السؤال قبل الإجابة.
- إذا كان السؤال يحتاج معلومات حديثة أو مباشرة من الإنترنت، استخدم Web Search.
- عند البحث في الإنترنت، اعتمد على مصادر موثوقة قدر الإمكان.
- عند الحديث عن الأخبار أو الأحداث الحالية، ابحث أولًا ولا تعتمد على معلومات قديمة.
- لا تقل إنك لا تستطيع الوصول إلى الإنترنت إذا كان Web Search متاحًا لك.
- لا تخترع روابط أو مصادر.
- إذا استخدمت البحث، اجعل المعلومات مبنية على النتائج التي وجدتها.
- عندما يحتاج المستخدم إلى شرح، اشرح بطريقة واضحة ومنظمة.
- عندما يطلب المستخدم كودًا، قدم كودًا نظيفًا وكاملًا وقابلًا للتطبيق.
- ساعد المستخدم على فهم المشكلة والتخطيط للحل وتنفيذه.
- لا تقل إنك NEURA؛ اسمك WEURA AI.

عند البحث عن الأخبار:
- ابحث عن أحدث المعلومات المتاحة.
- حاول استخدام أكثر من مصدر عندما يكون ذلك مفيدًا.
- ميّز بوضوح بين الأخبار المؤكدة والمعلومات غير المؤكدة.
                    `,

                    input: message,

                    max_output_tokens: 3000
                })
            }
        );

        const data = await response.json();

        // معالجة أخطاء OpenAI
        if (!response.ok) {
            console.error(
                "OpenAI API Error:",
                response.status,
                data
            );

            return res.status(
                response.status >= 500
                    ? 502
                    : response.status
            ).json({
                error:
                    data?.error?.message ||
                    "OpenAI API error"
            });
        }

        // النص النهائي الذي أنشأه النموذج
        let reply =
            typeof data.output_text === "string"
                ? data.output_text.trim()
                : "";

        // استخراج المصادر من Web Search
        const sources = [];

        if (Array.isArray(data.output)) {
            for (const item of data.output) {

                if (
                    item &&
                    item.type === "message" &&
                    Array.isArray(item.content)
                ) {
                    for (const content of item.content) {

                        if (
                            content &&
                            Array.isArray(content.annotations)
                        ) {
                            for (const annotation of content.annotations) {

                                if (
                                    annotation &&
                                    annotation.type === "url_citation" &&
                                    annotation.url
                                ) {
                                    const exists = sources.some(
                                        source =>
                                            source.url === annotation.url
                                    );

                                    if (!exists) {
                                        sources.push({
                                            title:
                                                annotation.title ||
                                                annotation.url,
                                            url: annotation.url
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // إضافة المصادر للنص إذا كانت موجودة
        if (sources.length > 0) {

            const sourceText = sources
                .slice(0, 8)
                .map(
                    (source, index) =>
                        `${index + 1}. ${source.title}\n${source.url}`
                )
                .join("\n\n");

            reply += `\n\n━━━━━━━━━━━━━━\nالمصادر:\n\n${sourceText}`;
        }

        // التأكد من وجود رد
        if (!reply) {
            return res.status(502).json({
                error: "The AI returned an empty response."
            });
        }

        return res.status(200).json({
            success: true,
            reply: reply,

            model: "gpt-5.6-luna",

            responseId:
                data.id || null,

            sources: sources
        });

    } catch (error) {

        console.error(
            "WEURA SERVER ERROR:",
            error
        );

        return res.status(500).json({
            error: "Internal server error"
        });
    }
}