const app = require('../../app');

module.exports = async function (req, res) {
    console.log('[AI营销] 开始处理营销文案生成请求');
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            console.log('[AI营销] 错误: 提示词为空');
            return res.status(400).json({
                success: false,
                message: '提示词不能为空'
            });
        }
        
        console.log('[AI营销] 提示词长度:', prompt.length);
        console.log('[AI营销] 提示词前100字符:', prompt.substring(0, 100));
        
        // 使用app.js中初始化的OpenAI实例
        const openai = app.openai;
        
        // 调用火山方舟AI
        const completion = await openai.chat.completions.create({
            model: 'deepseek-r1-250120',
            messages: [
                {
                    role: "system",
                    content: "你是一个专业的营销文案撰写专家，擅长编写吸引人的营销文案。请根据用户提供的课程信息，按照要求生成对应的营销文案。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });
        
        console.log('[AI营销] 成功生成文案');
        
        return res.json({
            success: true,
            content: completion.choices[0].message.content
        });
        
    } catch (error) {
        console.error('[AI营销] 生成文案失败:', error);
        return res.status(500).json({
            success: false,
            error: error.message || '生成文案失败'
        });
    }
}; 