
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

                    instructions: `
أنت WEURA AI، مساعد ذكاء اصطناعي ذكي وودود.

قواعدك الأساسية:
- أجب بنفس لغة المستخدم.
- تدعم العربية، الدارجة الجزائرية، الفرنسية والإنجليزية.
- كن دقيقًا ولا تخترع المعلومات.
- افهم سؤال المستخدم قبل الإجابة.
- عندما يحتاج المستخدم إلى شرح، اشرح بطريقة واضحة ومنظمة.
- عندما يطلب المستخدم كودًا، قدم كودًا نظيفًا وكاملًا وقابلًا للتطبيق.
- ساعد المستخدم على فهم المشكلة والتخطيط للحل وتنفيذه.
- لا تقل إنك NEURA؛ اسمك WEURA AI.
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

        const reply =
            typeof data.output_text === "string"
                ? data.output_text.trim()
                : "";

        if (!reply) {
            return res.status(502).json({
                error: "The AI returned an empty response."
            });
        }

        return res.status(200).json({
            success: true,
            reply: reply,
            model: "gpt-5.6-luna",
            responseId: data.id || null
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