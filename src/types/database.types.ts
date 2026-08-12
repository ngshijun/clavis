export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.4'
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'announcement_reads_announcement_id_fkey'
            columns: ['announcement_id']
            isOneToOne: false
            referencedRelation: 'announcements'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'announcement_reads_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          image_path: string | null
          is_pinned: boolean
          target_audience: Database['public']['Enums']['announcement_audience']
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          image_path?: string | null
          is_pinned?: boolean
          target_audience?: Database['public']['Enums']['announcement_audience']
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          image_path?: string | null
          is_pinned?: boolean
          target_audience?: Database['public']['Enums']['announcement_audience']
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'announcements_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      assessment_assignments: {
        Row: {
          assessment_id: string
          assigned_by: string
          class_id: string | null
          created_at: string
          due_at: string | null
          id: string
          student_id: string | null
        }
        Insert: {
          assessment_id: string
          assigned_by: string
          class_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          student_id?: string | null
        }
        Update: {
          assessment_id?: string
          assigned_by?: string
          class_id?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'assessment_assignments_assessment_id_fkey'
            columns: ['assessment_id']
            isOneToOne: false
            referencedRelation: 'assessments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_assignments_assigned_by_fkey'
            columns: ['assigned_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_assignments_class_id_fkey'
            columns: ['class_id']
            isOneToOne: false
            referencedRelation: 'classes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_assignments_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'student_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      assessment_attempts: {
        Row: {
          assessment_id: string
          completed_at: string | null
          correct_count: number
          current_question_index: number
          id: string
          score_percent: number
          started_at: string
          student_id: string
          total_questions: number
        }
        Insert: {
          assessment_id: string
          completed_at?: string | null
          correct_count?: number
          current_question_index?: number
          id?: string
          score_percent?: number
          started_at?: string
          student_id: string
          total_questions?: number
        }
        Update: {
          assessment_id?: string
          completed_at?: string | null
          correct_count?: number
          current_question_index?: number
          id?: string
          score_percent?: number
          started_at?: string
          student_id?: string
          total_questions?: number
        }
        Relationships: [
          {
            foreignKeyName: 'assessment_attempts_assessment_id_fkey'
            columns: ['assessment_id']
            isOneToOne: false
            referencedRelation: 'assessments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_attempts_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'student_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      assessment_questions: {
        Row: {
          assessment_id: string
          created_at: string
          id: string
          payload: Json | null
          points: number
          position: number
          question_id: string | null
        }
        Insert: {
          assessment_id: string
          created_at?: string
          id?: string
          payload?: Json | null
          points?: number
          position: number
          question_id?: string | null
        }
        Update: {
          assessment_id?: string
          created_at?: string
          id?: string
          payload?: Json | null
          points?: number
          position?: number
          question_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'assessment_questions_assessment_id_fkey'
            columns: ['assessment_id']
            isOneToOne: false
            referencedRelation: 'assessments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessment_questions_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'question_statistics'
            referencedColumns: ['question_id']
          },
          {
            foreignKeyName: 'assessment_questions_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
        ]
      }
      assessments: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          organization_id: string
          shuffle_questions: boolean
          status: Database['public']['Enums']['assessment_status']
          time_limit_seconds: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          organization_id: string
          shuffle_questions?: boolean
          status?: Database['public']['Enums']['assessment_status']
          time_limit_seconds?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          organization_id?: string
          shuffle_questions?: boolean
          status?: Database['public']['Enums']['assessment_status']
          time_limit_seconds?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'assessments_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'assessments_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      attempt_answers: {
        Row: {
          answered_at: string
          assessment_question_id: string
          attempt_id: string
          id: string
          is_correct: boolean
          selected_options: number[] | null
          text_answer: string | null
          time_spent_seconds: number | null
        }
        Insert: {
          answered_at?: string
          assessment_question_id: string
          attempt_id: string
          id?: string
          is_correct?: boolean
          selected_options?: number[] | null
          text_answer?: string | null
          time_spent_seconds?: number | null
        }
        Update: {
          answered_at?: string
          assessment_question_id?: string
          attempt_id?: string
          id?: string
          is_correct?: boolean
          selected_options?: number[] | null
          text_answer?: string | null
          time_spent_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'attempt_answers_assessment_question_id_fkey'
            columns: ['assessment_question_id']
            isOneToOne: false
            referencedRelation: 'assessment_questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attempt_answers_attempt_id_fkey'
            columns: ['attempt_id']
            isOneToOne: false
            referencedRelation: 'assessment_attempts'
            referencedColumns: ['id']
          },
        ]
      }
      attempt_questions: {
        Row: {
          assessment_question_id: string
          attempt_id: string
          question_order: number
        }
        Insert: {
          assessment_question_id: string
          attempt_id: string
          question_order: number
        }
        Update: {
          assessment_question_id?: string
          attempt_id?: string
          question_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'attempt_questions_assessment_question_id_fkey'
            columns: ['assessment_question_id']
            isOneToOne: false
            referencedRelation: 'assessment_questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'attempt_questions_attempt_id_fkey'
            columns: ['attempt_id']
            isOneToOne: false
            referencedRelation: 'assessment_attempts'
            referencedColumns: ['id']
          },
        ]
      }
      class_members: {
        Row: {
          class_id: string
          created_at: string
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'class_members_class_id_fkey'
            columns: ['class_id']
            isOneToOne: false
            referencedRelation: 'classes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'class_members_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'student_profiles'
            referencedColumns: ['id']
          },
        ]
      }
      classes: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'classes_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'classes_teacher_id_fkey'
            columns: ['teacher_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      grade_levels: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_history: {
        Row: {
          amount_cents: number
          created_at: string | null
          currency: string
          description: string | null
          id: string
          metadata: Json | null
          parent_id: string
          status: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          student_id: string | null
          tier: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          parent_id: string
          status: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          student_id?: string | null
          tier?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          parent_id?: string
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          student_id?: string | null
          tier?: string | null
        }
        Relationships: []
      }
      practice_answers: {
        Row: {
          answered_at: string | null
          id: string
          is_correct: boolean
          question_id: string | null
          selected_options: number[] | null
          session_id: string
          text_answer: string | null
          time_spent_seconds: number | null
        }
        Insert: {
          answered_at?: string | null
          id?: string
          is_correct: boolean
          question_id?: string | null
          selected_options?: number[] | null
          session_id: string
          text_answer?: string | null
          time_spent_seconds?: number | null
        }
        Update: {
          answered_at?: string | null
          id?: string
          is_correct?: boolean
          question_id?: string | null
          selected_options?: number[] | null
          session_id?: string
          text_answer?: string | null
          time_spent_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'practice_answers_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'question_statistics'
            referencedColumns: ['question_id']
          },
          {
            foreignKeyName: 'practice_answers_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_answers_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'practice_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      practice_sessions: {
        Row: {
          ai_summary: string | null
          completed_at: string | null
          correct_count: number | null
          created_at: string | null
          current_question_index: number | null
          grade_level_id: string | null
          id: string
          student_id: string
          sub_topic_id: string
          subject_id: string | null
          total_questions: number
          total_time_seconds: number | null
        }
        Insert: {
          ai_summary?: string | null
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string | null
          current_question_index?: number | null
          grade_level_id?: string | null
          id?: string
          student_id: string
          sub_topic_id: string
          subject_id?: string | null
          total_questions: number
          total_time_seconds?: number | null
        }
        Update: {
          ai_summary?: string | null
          completed_at?: string | null
          correct_count?: number | null
          created_at?: string | null
          current_question_index?: number | null
          grade_level_id?: string | null
          id?: string
          student_id?: string
          sub_topic_id?: string
          subject_id?: string | null
          total_questions?: number
          total_time_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'practice_sessions_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_sessions_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_sessions_sub_topic_id_fkey'
            columns: ['sub_topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'practice_sessions_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string
          has_completed_tour: boolean
          id: string
          name: string
          organization_id: string | null
          updated_at: string | null
          user_type: Database['public']['Enums']['user_role']
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email: string
          has_completed_tour?: boolean
          id: string
          name: string
          organization_id?: string | null
          updated_at?: string | null
          user_type: Database['public']['Enums']['user_role']
        }
        Update: {
          avatar_path?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string
          has_completed_tour?: boolean
          id?: string
          name?: string
          organization_id?: string | null
          updated_at?: string | null
          user_type?: Database['public']['Enums']['user_role']
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      question_feedback: {
        Row: {
          category: Database['public']['Enums']['feedback_category']
          comments: string | null
          created_at: string | null
          id: string
          question_id: string
          reported_by: string
        }
        Insert: {
          category: Database['public']['Enums']['feedback_category']
          comments?: string | null
          created_at?: string | null
          id?: string
          question_id: string
          reported_by: string
        }
        Update: {
          category?: Database['public']['Enums']['feedback_category']
          comments?: string | null
          created_at?: string | null
          id?: string
          question_id?: string
          reported_by?: string
        }
        Relationships: [
          {
            foreignKeyName: 'question_feedback_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'question_statistics'
            referencedColumns: ['question_id']
          },
          {
            foreignKeyName: 'question_feedback_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'question_feedback_reported_by_fkey'
            columns: ['reported_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      questions: {
        Row: {
          answer: string | null
          created_at: string | null
          explanation: string | null
          grade_level_id: string | null
          id: string
          image_hash: string | null
          image_path: string | null
          option_1_image_path: string | null
          option_1_is_correct: boolean | null
          option_1_text: string | null
          option_2_image_path: string | null
          option_2_is_correct: boolean | null
          option_2_text: string | null
          option_3_image_path: string | null
          option_3_is_correct: boolean | null
          option_3_text: string | null
          option_4_image_path: string | null
          option_4_is_correct: boolean | null
          option_4_text: string | null
          question: string
          sub_topic_id: string
          subject_id: string | null
          type: Database['public']['Enums']['question_type']
          updated_at: string
        }
        Insert: {
          answer?: string | null
          created_at?: string | null
          explanation?: string | null
          grade_level_id?: string | null
          id?: string
          image_hash?: string | null
          image_path?: string | null
          option_1_image_path?: string | null
          option_1_is_correct?: boolean | null
          option_1_text?: string | null
          option_2_image_path?: string | null
          option_2_is_correct?: boolean | null
          option_2_text?: string | null
          option_3_image_path?: string | null
          option_3_is_correct?: boolean | null
          option_3_text?: string | null
          option_4_image_path?: string | null
          option_4_is_correct?: boolean | null
          option_4_text?: string | null
          question: string
          sub_topic_id: string
          subject_id?: string | null
          type: Database['public']['Enums']['question_type']
          updated_at?: string
        }
        Update: {
          answer?: string | null
          created_at?: string | null
          explanation?: string | null
          grade_level_id?: string | null
          id?: string
          image_hash?: string | null
          image_path?: string | null
          option_1_image_path?: string | null
          option_1_is_correct?: boolean | null
          option_1_text?: string | null
          option_2_image_path?: string | null
          option_2_is_correct?: boolean | null
          option_2_text?: string | null
          option_3_image_path?: string | null
          option_3_is_correct?: boolean | null
          option_3_text?: string | null
          option_4_image_path?: string | null
          option_4_is_correct?: boolean | null
          option_4_text?: string | null
          question?: string
          sub_topic_id?: string
          subject_id?: string | null
          type?: Database['public']['Enums']['question_type']
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'questions_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_sub_topic_id_fkey'
            columns: ['sub_topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
      schools: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      session_questions: {
        Row: {
          id: string
          question_id: string
          question_order: number
          session_id: string
        }
        Insert: {
          id?: string
          question_id: string
          question_order: number
          session_id: string
        }
        Update: {
          id?: string
          question_id?: string
          question_order?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'session_questions_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'question_statistics'
            referencedColumns: ['question_id']
          },
          {
            foreignKeyName: 'session_questions_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'session_questions_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'practice_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      student_profiles: {
        Row: {
          created_at: string | null
          created_by: string | null
          grade_level_id: string | null
          id: string
          preferred_language: string
          school_id: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          grade_level_id?: string | null
          id: string
          preferred_language?: string
          school_id?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          grade_level_id?: string | null
          id?: string
          preferred_language?: string
          school_id?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'student_profiles_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_profiles_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_profiles_id_fkey'
            columns: ['id']
            isOneToOne: true
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_profiles_school_id_fkey'
            columns: ['school_id']
            isOneToOne: false
            referencedRelation: 'schools'
            referencedColumns: ['id']
          },
        ]
      }
      student_question_progress: {
        Row: {
          created_at: string
          cycle_number: number
          id: string
          question_id: string
          student_id: string
          sub_topic_id: string
        }
        Insert: {
          created_at?: string
          cycle_number?: number
          id?: string
          question_id: string
          student_id: string
          sub_topic_id: string
        }
        Update: {
          created_at?: string
          cycle_number?: number
          id?: string
          question_id?: string
          student_id?: string
          sub_topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'student_question_progress_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'question_statistics'
            referencedColumns: ['question_id']
          },
          {
            foreignKeyName: 'student_question_progress_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_question_progress_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_question_progress_sub_topic_id_fkey'
            columns: ['sub_topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
        ]
      }
      student_sub_topic_stats: {
        Row: {
          best_score_percent: number
          last_completed_at: string | null
          sessions_completed: number
          student_id: string
          sub_topic_id: string
        }
        Insert: {
          best_score_percent?: number
          last_completed_at?: string | null
          sessions_completed?: number
          student_id: string
          sub_topic_id: string
        }
        Update: {
          best_score_percent?: number
          last_completed_at?: string | null
          sessions_completed?: number
          student_id?: string
          sub_topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'student_sub_topic_stats_student_id_fkey'
            columns: ['student_id']
            isOneToOne: false
            referencedRelation: 'student_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'student_sub_topic_stats_sub_topic_id_fkey'
            columns: ['sub_topic_id']
            isOneToOne: false
            referencedRelation: 'sub_topics'
            referencedColumns: ['id']
          },
        ]
      }
      sub_topics: {
        Row: {
          cover_image_path: string | null
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          topic_id: string
          updated_at: string | null
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          topic_id: string
          updated_at?: string | null
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          topic_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'sub_topics_topic_id_fkey'
            columns: ['topic_id']
            isOneToOne: false
            referencedRelation: 'topics'
            referencedColumns: ['id']
          },
        ]
      }
      subjects: {
        Row: {
          cover_image_path: string | null
          created_at: string | null
          display_order: number | null
          grade_level_id: string
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          grade_level_id: string
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          grade_level_id?: string
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'subjects_grade_level_id_fkey'
            columns: ['grade_level_id']
            isOneToOne: false
            referencedRelation: 'grade_levels'
            referencedColumns: ['id']
          },
        ]
      }
      topics: {
        Row: {
          cover_image_path: string | null
          created_at: string | null
          display_order: number | null
          id: string
          name: string
          subject_id: string
          updated_at: string | null
        }
        Insert: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name: string
          subject_id: string
          updated_at?: string | null
        }
        Update: {
          cover_image_path?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          name?: string
          subject_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'topics_subject_id_fkey'
            columns: ['subject_id']
            isOneToOne: false
            referencedRelation: 'subjects'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      question_statistics: {
        Row: {
          attempts: number | null
          avg_time_seconds: number | null
          correct_count: number | null
          correctness_rate: number | null
          question_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      complete_assessment_attempt: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      complete_practice_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      create_practice_session: {
        Args: {
          p_cycle_number: number
          p_grade_level_id: string
          p_questions: Json
          p_student_id: string
          p_sub_topic_id: string
          p_subject_id: string
        }
        Returns: string
      }
      get_question_statistics: {
        Args: never
        Returns: {
          attempts: number
          avg_time_seconds: number
          correct_count: number
          correctness_rate: number
          question_id: string
        }[]
      }
      get_subtopic_answered_counts: {
        Args: never
        Returns: {
          answered_count: number
          sub_topic_id: string
        }[]
      }
      get_unread_announcement_count: { Args: never; Returns: number }
      refresh_question_statistics: { Args: never; Returns: undefined }
      start_assessment_attempt: {
        Args: { p_assessment_id: string }
        Returns: Json
      }
    }
    Enums: {
      announcement_audience: 'all' | 'students_only' | 'parents_only'
      assessment_status: 'draft' | 'published'
      feedback_category:
        | 'question_error'
        | 'image_error'
        | 'option_error'
        | 'answer_error'
        | 'explanation_error'
        | 'other'
      question_type: 'mcq' | 'short_answer' | 'mrq'
      user_role: 'admin' | 'manager' | 'teacher' | 'student'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      announcement_audience: ['all', 'students_only', 'parents_only'],
      assessment_status: ['draft', 'published'],
      feedback_category: [
        'question_error',
        'image_error',
        'option_error',
        'answer_error',
        'explanation_error',
        'other',
      ],
      question_type: ['mcq', 'short_answer', 'mrq'],
      user_role: ['admin', 'manager', 'teacher', 'student'],
    },
  },
} as const
