import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders, errorResponse } from '../_shared/stripe.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { getAuthenticatedUser } from '../_shared/auth.ts'

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!

interface QuestionData {
  question: string
  type: 'mcq' | 'mrq' | 'short_answer'
  isCorrect: boolean
  studentAnswer: string | null
  correctAnswer: string | null
  questionImageUrl: string | null
  options: {
    label: string
    text: string | null
    imageUrl: string | null
    isCorrect: boolean
    isStudentAnswer: boolean
  }[]
}


interface SessionData {
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
  totalQuestions: number
  correctCount: number
  totalTimeSeconds: number
  questions: QuestionData[]
}

function getImagePublicUrl(path: string | null): string | null {
  if (!path) return null
  if (path.startsWith('http')) return path
  // Use Supabase image transformation to resize images to 512x512
  // This matches OpenAI's detail: 'low' processing size and speeds up image fetching
  return `${supabaseUrl}/storage/v1/render/image/public/question-images/${path}?width=512&height=512&resize=contain`
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    // Authenticate the request
    const user = await getAuthenticatedUser(req)

    const { sessionId } = await req.json()

    if (!sessionId) {
      return errorResponse('Missing sessionId', 400)
    }

    // Fetch session with sub_topic chain (sub_topics -> topics -> subjects -> grade_levels)
    // Note: topic_id column now references sub_topics table
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('practice_sessions')
      .select(`
        id,
        student_id,
        total_questions,
        correct_count,
        total_time_seconds,
        ai_summary,
        sub_topics (
          name,
          topics (
            name,
            subjects (
              name,
              grade_levels (
                name
              )
            )
          )
        )
      `)
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return errorResponse('Session not found', 404)
    }

    // Verify the authenticated user owns this session
    if (session.student_id !== user.id) {
      return errorResponse('Not authorized to access this session', 403)
    }

    // Fetch student's subscription tier and language preference
    const { data: studentProfile } = await supabaseAdmin
      .from('student_profiles')
      .select('preferred_language, subscription_tier')
      .eq('id', session.student_id)
      .single()

    // Verify Pro/Max tier (AI summaries are a paid feature)
    const tier = studentProfile?.subscription_tier
    if (tier !== 'pro' && tier !== 'max') {
      return errorResponse('AI summaries require a Pro subscription', 403)
    }

    const preferredLanguage = studentProfile?.preferred_language ?? 'en'

    // If summary already exists, return it
    if (session.ai_summary) {
      return new Response(JSON.stringify({ summary: session.ai_summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch answers with questions (including image paths)
    const { data: answers, error: answersError } = await supabaseAdmin
      .from('practice_answers')
      .select(`
        is_correct,
        selected_options,
        text_answer,
        questions!inner(
          question,
          type,
          answer,
          image_path,
          option_1_text,
          option_2_text,
          option_3_text,
          option_4_text,
          option_1_image_path,
          option_2_image_path,
          option_3_image_path,
          option_4_image_path,
          option_1_is_correct,
          option_2_is_correct,
          option_3_is_correct,
          option_4_is_correct
        )
      `)
      .eq('session_id', sessionId)

    if (answersError) {
      return errorResponse('Failed to fetch answers', 500, answersError)
    }

    // Build session data for prompt
    const questionsData: QuestionData[] = (answers || []).map((a: any) => {
      const q = a.questions
      let studentAnswer: string | null = null
      let correctAnswer: string | null = null

      const options: QuestionData['options'] = []
      // selected_options is now an array of numbers (1-4)
      const selectedOptions: number[] = a.selected_options || []

      if (q.type === 'mcq' || q.type === 'mrq') {
        // Build options array
        const optionLabels = ['A', 'B', 'C', 'D']
        const optionData = [
          { text: q.option_1_text, imagePath: q.option_1_image_path, isCorrect: q.option_1_is_correct },
          { text: q.option_2_text, imagePath: q.option_2_image_path, isCorrect: q.option_2_is_correct },
          { text: q.option_3_text, imagePath: q.option_3_image_path, isCorrect: q.option_3_is_correct },
          { text: q.option_4_text, imagePath: q.option_4_image_path, isCorrect: q.option_4_is_correct },
        ]

        const studentAnswers: string[] = []
        const correctAnswers: string[] = []

        optionData.forEach((opt, index) => {
          if (opt.text || opt.imagePath) {
            const label = optionLabels[index]
            const isStudentAnswer = selectedOptions.includes(index + 1)
            options.push({
              label,
              text: opt.text,
              imageUrl: getImagePublicUrl(opt.imagePath),
              isCorrect: opt.isCorrect ?? false,
              isStudentAnswer,
            })
            if (opt.isCorrect) correctAnswers.push(label)
            if (isStudentAnswer) studentAnswers.push(label)
          }
        })

        // For MCQ: single answer, for MRQ: comma-separated
        studentAnswer = studentAnswers.length > 0 ? studentAnswers.join(', ') : null
        correctAnswer = correctAnswers.length > 0 ? correctAnswers.join(', ') : null
      } else {
        studentAnswer = a.text_answer
        correctAnswer = q.answer
      }

      return {
        question: q.question,
        type: q.type,
        isCorrect: a.is_correct,
        studentAnswer,
        correctAnswer,
        questionImageUrl: getImagePublicUrl(q.image_path),
        options,
      }
    })

    // Extract names from nested sub_topic structure
    // New hierarchy: sub_topics -> topics -> subjects -> grade_levels
    const subTopic = session.sub_topics as any
    const subTopicName = subTopic?.name || 'Unknown'
    const topicName = subTopic?.topics?.name || 'Unknown'
    const subjectName = subTopic?.topics?.subjects?.name || 'Unknown'
    const gradeLevelName = subTopic?.topics?.subjects?.grade_levels?.name || 'Unknown'

    // Build the messages for OpenAI
    const messages = buildMessages({
      gradeLevelName,
      subjectName,
      topicName,
      subTopicName,
      totalQuestions: session.total_questions,
      correctCount: session.correct_count || 0,
      totalTimeSeconds: session.total_time_seconds || 0,
      questions: questionsData,
    }, preferredLanguage)

    // Call OpenAI API directly using fetch
    // Note: gpt-5-nano uses max_completion_tokens (not max_tokens)
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 1000,
        temperature: 0,
      }),
    })

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.text()
      console.error('OpenAI API error:', errorData)
      return new Response(`OpenAI API error: ${errorData}`, { status: 500, headers: corsHeaders })
    }

    const completion = await openaiResponse.json()
    console.log('OpenAI response:', JSON.stringify(completion, null, 2))

    // Handle both Chat Completions and Responses API formats
    const summary =
      completion.choices?.[0]?.message?.content?.trim() ||
      completion.output?.[0]?.content?.[0]?.text?.trim() ||
      null

    if (!summary) {
      console.error('No summary content found in response:', JSON.stringify(completion))
      return new Response(
        JSON.stringify({ error: 'Failed to generate summary', response: completion }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Save summary to database
    const { error: updateError } = await supabaseAdmin
      .from('practice_sessions')
      .update({ ai_summary: summary })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Failed to save summary:', updateError)
      // Still return the summary even if save fails
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    if (error instanceof Response) return error
    return errorResponse('Failed to generate session summary', 500, error)
  }
})

function buildMessages(data: SessionData, language: string): any[] {
  const score = data.totalQuestions > 0
    ? Math.round((data.correctCount / data.totalQuestions) * 100)
    : 0

  const minutes = Math.floor(data.totalTimeSeconds / 60)
  const seconds = data.totalTimeSeconds % 60
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

  // Build system message
  const systemMessage = {
    role: 'system',
    content: `You are a friendly tutor giving feedback to a primary school student (ages 7-12) after a practice session. Parents may also read this.

Write a detailed but easy-to-read feedback that a child can understand.

Structure:
1. Start positive (1 sentence) - mention something good (effort, what they got right)
2. Go through EACH wrong question and explain specifically what went wrong (1-2 sentences per wrong question)
   - Use the ORIGINAL question number (e.g., "Question 3" not "1st wrong question")
   - Mention the actual content: "For Question 3 about 'menaiki tangga' (climbing stairs), you picked the picture of someone going down instead of up"
   - Explain the correct answer simply: "The right answer was B because..."
   - For short answer questions, compare the student's answer to the correct answer: note spelling mistakes if close, or explain the correct answer if completely wrong
   - If there are many wrong questions, group similar mistakes together
3. Summarize the main area to focus on (1 sentence)
4. End with warm encouragement (1 sentence)

Formatting:
- Format each question as: "**Question X**: explanation here" (with colon after the bold question number)
- Use **bold** for question numbers and key Malay words/phrases
- Keep it compact - NO horizontal rules (---), NO excessive line breaks
- Group all wrong questions together in one section without separators between them
- Use a single blank line only between major sections (intro, questions, focus area, encouragement)

Rules:
- Use simple words a 7-year-old can understand
- Be VERY specific - mention actual words, phrases, or content from the questions
- Cover ALL wrong questions, don't skip any
- Keep sentences short and clear
- Be warm and encouraging, but honest about mistakes
- Never be harsh or discouraging
- If score is perfect, keep it SHORT (2-3 sentences max): celebrate the achievement, mention one specific thing they did well, and encourage them. Do NOT list individual questions.`,
  }

  if (language === 'zh') {
    systemMessage.content += '\n\nIMPORTANT: Write your ENTIRE response in Chinese (Simplified). Use simple Chinese that a 7-12 year old can understand.'
  }

  // Build user message content (can include text and images)
  const userContent: any[] = []

  // Add session summary text
  let summaryText = `Practice Session Summary:
- Subject: ${data.subjectName}
- Topic: ${data.topicName}
- Sub-Topic: ${data.subTopicName}
- Grade Level: ${data.gradeLevelName}
- Score: ${data.correctCount}/${data.totalQuestions} (${score}%)
- Time: ${timeStr}`

  if (score === 100) {
    summaryText += '\n\nThe student got a perfect score!'
  } else if (score >= 80) {
    summaryText += '\n\nThe student performed very well.'
  } else if (score >= 60) {
    summaryText += '\n\nThe student showed good effort but has room for improvement.'
  } else {
    summaryText += '\n\nThe student struggled with this topic and may need additional practice.'
  }

  userContent.push({ type: 'text', text: summaryText })

  // Add all questions with images (both correct and incorrect)
  userContent.push({ type: 'text', text: '\n\nAll questions:' })

  data.questions.forEach((q, index) => {
    const status = q.isCorrect ? '✓ CORRECT' : '✗ WRONG'

    // Build option list text for MCQ/MRQ so the AI knows what each label means
    let optionsText = ''
    if ((q.type === 'mcq' || q.type === 'mrq') && q.options.length > 0) {
      const textOptions = q.options.filter((opt) => opt.text)
      if (textOptions.length > 0) {
        optionsText = '\n   Options: ' + textOptions.map((opt) => `${opt.label}: ${opt.text}`).join(', ')
      }
    }

    // Include option values alongside labels for student/correct answers
    const studentAnswerText = q.studentAnswer
      ? q.options.filter((opt) => opt.isStudentAnswer).map((opt) => opt.text ? `${opt.label} (${opt.text})` : opt.label).join(', ') || q.studentAnswer
      : 'No answer'
    const correctAnswerText = q.correctAnswer
      ? q.options.filter((opt) => opt.isCorrect).map((opt) => opt.text ? `${opt.label} (${opt.text})` : opt.label).join(', ') || q.correctAnswer
      : 'N/A'

    // Add question text with status
    userContent.push({
      type: 'text',
      text: `\n${index + 1}. [${status}] Question: ${q.question}${optionsText}\n   Student's answer: ${studentAnswerText}\n   Correct answer: ${correctAnswerText}`,
    })

    // Add question image if exists
    // Using detail: 'low' for efficient processing (512x512, 85 tokens per image)
    if (q.questionImageUrl) {
      userContent.push({
        type: 'image_url',
        image_url: { url: q.questionImageUrl, detail: 'low' },
      })
    }

    // Add option images for MCQ/MRQ (only for options that have images)
    if ((q.type === 'mcq' || q.type === 'mrq') && q.options.length > 0) {
      const optionsWithImages = q.options.filter((opt) => opt.imageUrl)
      if (optionsWithImages.length > 0) {
        userContent.push({ type: 'text', text: '   Options:' })
        optionsWithImages.forEach((opt) => {
          const marker = opt.isCorrect ? '(correct)' : opt.isStudentAnswer ? '(student chose)' : ''
          userContent.push({ type: 'text', text: `   ${opt.label}${marker}:` })
          userContent.push({
            type: 'image_url',
            image_url: { url: opt.imageUrl!, detail: 'low' },
          })
        })
      }
    }
  })

  return [
    systemMessage,
    { role: 'user', content: userContent },
  ]
}
