import { baseApi as api } from './base';
export const addTagTypes = [
  'system',
  'auth',
  'student',
  'workspaces',
  'members',
  'groups',
  'exams',
  'sessions',
  'attendance',
  'stats',
  'money',
  'messages',
  'students',
  'student-auth',
] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      getHealth: build.query<GetHealthApiResponse, GetHealthApiArg>({
        query: () => ({ url: `/health` }),
        providesTags: ['system'],
      }),
      register: build.mutation<RegisterApiResponse, RegisterApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/auth/register`,
          method: 'POST',
          body: queryArg.registerRequest,
        }),
        invalidatesTags: ['auth'],
      }),
      login: build.mutation<LoginApiResponse, LoginApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/auth/login`,
          method: 'POST',
          body: queryArg.loginRequest,
        }),
        invalidatesTags: ['auth'],
      }),
      refresh: build.mutation<RefreshApiResponse, RefreshApiArg>({
        query: () => ({ url: `/api/v1/auth/refresh`, method: 'POST' }),
        invalidatesTags: ['auth'],
      }),
      logout: build.mutation<LogoutApiResponse, LogoutApiArg>({
        query: () => ({ url: `/api/v1/auth/logout`, method: 'POST' }),
        invalidatesTags: ['auth'],
      }),
      forgotPassword: build.mutation<ForgotPasswordApiResponse, ForgotPasswordApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/auth/password-reset`,
          method: 'POST',
          body: queryArg.forgotPasswordRequest,
        }),
        invalidatesTags: ['auth'],
      }),
      resetPassword: build.mutation<ResetPasswordApiResponse, ResetPasswordApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/auth/password-reset/confirm`,
          method: 'POST',
          body: queryArg.resetPasswordRequest,
        }),
        invalidatesTags: ['auth'],
      }),
      getMe: build.query<GetMeApiResponse, GetMeApiArg>({
        query: () => ({ url: `/api/v1/me` }),
        providesTags: ['auth'],
      }),
      getMySchedule: build.query<GetMyScheduleApiResponse, GetMyScheduleApiArg>({
        query: () => ({ url: `/api/v1/me/schedule` }),
        providesTags: ['student'],
      }),
      getMyAttendance: build.query<GetMyAttendanceApiResponse, GetMyAttendanceApiArg>({
        query: () => ({ url: `/api/v1/me/attendance` }),
        providesTags: ['student'],
      }),
      getMyGrades: build.query<GetMyGradesApiResponse, GetMyGradesApiArg>({
        query: () => ({ url: `/api/v1/me/grades` }),
        providesTags: ['student'],
      }),
      createWorkspace: build.mutation<CreateWorkspaceApiResponse, CreateWorkspaceApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/workspaces`,
          method: 'POST',
          body: queryArg.createWorkspaceRequest,
        }),
        invalidatesTags: ['workspaces'],
      }),
      listWorkspaces: build.query<ListWorkspacesApiResponse, ListWorkspacesApiArg>({
        query: () => ({ url: `/api/v1/workspaces` }),
        providesTags: ['workspaces'],
      }),
      getCurrentWorkspace: build.query<GetCurrentWorkspaceApiResponse, GetCurrentWorkspaceApiArg>({
        query: () => ({ url: `/api/v1/workspaces/current` }),
        providesTags: ['workspaces'],
      }),
      createInvite: build.mutation<CreateInviteApiResponse, CreateInviteApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/invites`,
          method: 'POST',
          body: queryArg.createInviteRequest,
        }),
        invalidatesTags: ['members'],
      }),
      listInvites: build.query<ListInvitesApiResponse, ListInvitesApiArg>({
        query: () => ({ url: `/api/v1/invites` }),
        providesTags: ['members'],
      }),
      revokeInvite: build.mutation<RevokeInviteApiResponse, RevokeInviteApiArg>({
        query: (queryArg) => ({ url: `/api/v1/invites/${queryArg.id}`, method: 'DELETE' }),
        invalidatesTags: ['members'],
      }),
      getInvitePreview: build.query<GetInvitePreviewApiResponse, GetInvitePreviewApiArg>({
        query: (queryArg) => ({ url: `/api/v1/invites/${queryArg.token}` }),
        providesTags: ['members'],
      }),
      createStaffResetLink: build.mutation<
        CreateStaffResetLinkApiResponse,
        CreateStaffResetLinkApiArg
      >({
        query: (queryArg) => ({
          url: `/api/v1/members/${queryArg.id}/password-reset`,
          method: 'POST',
        }),
        invalidatesTags: ['members'],
      }),
      acceptInvite: build.mutation<AcceptInviteApiResponse, AcceptInviteApiArg>({
        query: (queryArg) => ({ url: `/api/v1/invites/${queryArg.token}/accept`, method: 'POST' }),
        invalidatesTags: ['members'],
      }),
      listMembers: build.query<ListMembersApiResponse, ListMembersApiArg>({
        query: () => ({ url: `/api/v1/members` }),
        providesTags: ['members'],
      }),
      updateMember: build.mutation<UpdateMemberApiResponse, UpdateMemberApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/members/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateMemberRequest,
        }),
        invalidatesTags: ['members', 'groups'],
      }),
      setAssistantScopes: build.mutation<SetAssistantScopesApiResponse, SetAssistantScopesApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/members/${queryArg.id}/scopes`,
          method: 'PUT',
          body: queryArg.setScopesRequest,
        }),
        invalidatesTags: ['members'],
      }),
      listSubjects: build.query<ListSubjectsApiResponse, ListSubjectsApiArg>({
        query: () => ({ url: `/api/v1/subjects` }),
        providesTags: ['groups'],
      }),
      createSubject: build.mutation<CreateSubjectApiResponse, CreateSubjectApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/subjects`,
          method: 'POST',
          body: queryArg.createCurriculumRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      reorderSubjects: build.mutation<ReorderSubjectsApiResponse, ReorderSubjectsApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/subjects/order`,
          method: 'PUT',
          body: queryArg.reorderCurriculumRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      updateSubject: build.mutation<UpdateSubjectApiResponse, UpdateSubjectApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/subjects/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateCurriculumRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      listGradeLevels: build.query<ListGradeLevelsApiResponse, ListGradeLevelsApiArg>({
        query: () => ({ url: `/api/v1/grade-levels` }),
        providesTags: ['groups'],
      }),
      createGradeLevel: build.mutation<CreateGradeLevelApiResponse, CreateGradeLevelApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/grade-levels`,
          method: 'POST',
          body: queryArg.createCurriculumRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      reorderGradeLevels: build.mutation<ReorderGradeLevelsApiResponse, ReorderGradeLevelsApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/grade-levels/order`,
          method: 'PUT',
          body: queryArg.reorderCurriculumRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      updateGradeLevel: build.mutation<UpdateGradeLevelApiResponse, UpdateGradeLevelApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/grade-levels/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateCurriculumRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      listRooms: build.query<ListRoomsApiResponse, ListRoomsApiArg>({
        query: () => ({ url: `/api/v1/rooms` }),
        providesTags: ['groups'],
      }),
      createRoom: build.mutation<CreateRoomApiResponse, CreateRoomApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/rooms`,
          method: 'POST',
          body: queryArg.createRoomRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      updateRoom: build.mutation<UpdateRoomApiResponse, UpdateRoomApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/rooms/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateRoomRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      listGroups: build.query<ListGroupsApiResponse, ListGroupsApiArg>({
        query: () => ({ url: `/api/v1/groups` }),
        providesTags: ['groups'],
      }),
      createGroup: build.mutation<CreateGroupApiResponse, CreateGroupApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/groups`,
          method: 'POST',
          body: queryArg.createGroupRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      getGroup: build.query<GetGroupApiResponse, GetGroupApiArg>({
        query: (queryArg) => ({ url: `/api/v1/groups/${queryArg.id}` }),
        providesTags: ['groups'],
      }),
      updateGroup: build.mutation<UpdateGroupApiResponse, UpdateGroupApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/groups/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateGroupRequest,
        }),
        invalidatesTags: ['groups'],
      }),
      listExams: build.query<ListExamsApiResponse, ListExamsApiArg>({
        query: (queryArg) => ({ url: `/api/v1/groups/${queryArg.id}/exams` }),
        providesTags: ['exams'],
      }),
      createExam: build.mutation<CreateExamApiResponse, CreateExamApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/groups/${queryArg.id}/exams`,
          method: 'POST',
          body: queryArg.createExamRequest,
        }),
        invalidatesTags: ['exams'],
      }),
      getExamSheet: build.query<GetExamSheetApiResponse, GetExamSheetApiArg>({
        query: (queryArg) => ({ url: `/api/v1/exams/${queryArg.id}` }),
        providesTags: ['exams'],
      }),
      updateExam: build.mutation<UpdateExamApiResponse, UpdateExamApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/exams/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateExamRequest,
        }),
        invalidatesTags: ['exams'],
      }),
      deleteExam: build.mutation<DeleteExamApiResponse, DeleteExamApiArg>({
        query: (queryArg) => ({ url: `/api/v1/exams/${queryArg.id}`, method: 'DELETE' }),
        invalidatesTags: ['exams'],
      }),
      saveExamResults: build.mutation<SaveExamResultsApiResponse, SaveExamResultsApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/exams/${queryArg.id}/results`,
          method: 'PUT',
          body: queryArg.saveExamResultsRequest,
        }),
        invalidatesTags: ['exams'],
      }),
      notifyExam: build.mutation<NotifyExamApiResponse, NotifyExamApiArg>({
        query: (queryArg) => ({ url: `/api/v1/exams/${queryArg.id}/notify`, method: 'POST' }),
        invalidatesTags: ['exams'],
      }),
      listSessions: build.query<ListSessionsApiResponse, ListSessionsApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/sessions`,
          params: {
            from: queryArg['from'],
            to: queryArg.to,
          },
        }),
        providesTags: ['sessions'],
      }),
      moveSession: build.mutation<MoveSessionApiResponse, MoveSessionApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/sessions/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.moveSessionRequest,
        }),
        invalidatesTags: ['sessions'],
      }),
      cancelSession: build.mutation<CancelSessionApiResponse, CancelSessionApiArg>({
        query: (queryArg) => ({ url: `/api/v1/sessions/${queryArg.id}/cancel`, method: 'POST' }),
        invalidatesTags: ['sessions'],
      }),
      openSession: build.mutation<OpenSessionApiResponse, OpenSessionApiArg>({
        query: (queryArg) => ({ url: `/api/v1/sessions/${queryArg.id}/open`, method: 'POST' }),
        invalidatesTags: ['attendance'],
      }),
      listAttendance: build.query<ListAttendanceApiResponse, ListAttendanceApiArg>({
        query: (queryArg) => ({ url: `/api/v1/sessions/${queryArg.id}/attendance` }),
        providesTags: ['attendance'],
      }),
      getTodayStats: build.query<GetTodayStatsApiResponse, GetTodayStatsApiArg>({
        query: () => ({ url: `/api/v1/stats/today` }),
        providesTags: ['attendance'],
      }),
      getTrendStats: build.query<GetTrendStatsApiResponse, GetTrendStatsApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/stats/trends`,
          params: {
            weeks: queryArg.weeks,
          },
        }),
        providesTags: ['stats'],
      }),
      getOwingStudents: build.query<GetOwingStudentsApiResponse, GetOwingStudentsApiArg>({
        query: () => ({ url: `/api/v1/stats/owing` }),
        providesTags: ['money'],
      }),
      getCollectionStats: build.query<GetCollectionStatsApiResponse, GetCollectionStatsApiArg>({
        query: () => ({ url: `/api/v1/stats/collections` }),
        providesTags: ['money'],
      }),
      getCashSummary: build.query<GetCashSummaryApiResponse, GetCashSummaryApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/stats/cash-summary`,
          params: {
            date: queryArg.date,
          },
        }),
        providesTags: ['money'],
      }),
      getSessionRoster: build.query<GetSessionRosterApiResponse, GetSessionRosterApiArg>({
        query: (queryArg) => ({ url: `/api/v1/sessions/${queryArg.id}/roster` }),
        providesTags: ['attendance'],
      }),
      markAttendance: build.mutation<MarkAttendanceApiResponse, MarkAttendanceApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/sessions/${queryArg.id}/attendance/${queryArg.studentId}`,
          method: 'PUT',
          body: queryArg.markAttendanceRequest,
        }),
        invalidatesTags: ['attendance'],
      }),
      closeSession: build.mutation<CloseSessionApiResponse, CloseSessionApiArg>({
        query: (queryArg) => ({ url: `/api/v1/sessions/${queryArg.id}/close`, method: 'POST' }),
        invalidatesTags: ['attendance'],
      }),
      liveAttendance: build.query<LiveAttendanceApiResponse, LiveAttendanceApiArg>({
        query: (queryArg) => ({ url: `/api/v1/sessions/${queryArg.id}/live` }),
        providesTags: ['attendance'],
      }),
      getStudentLedger: build.query<GetStudentLedgerApiResponse, GetStudentLedgerApiArg>({
        query: (queryArg) => ({ url: `/api/v1/students/${queryArg.id}/ledger` }),
        providesTags: ['money'],
      }),
      createPayment: build.mutation<CreatePaymentApiResponse, CreatePaymentApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/payments`,
          method: 'POST',
          body: queryArg.createPaymentRequest,
          headers: {
            'idempotency-key': queryArg['idempotency-key'],
          },
        }),
        invalidatesTags: ['money'],
      }),
      reverseEntry: build.mutation<ReverseEntryApiResponse, ReverseEntryApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/ledger/${queryArg.id}/reverse`,
          method: 'POST',
          headers: {
            'idempotency-key': queryArg['idempotency-key'],
          },
        }),
        invalidatesTags: ['money'],
      }),
      getReceipt: build.query<GetReceiptApiResponse, GetReceiptApiArg>({
        query: (queryArg) => ({ url: `/api/v1/ledger/${queryArg.id}/receipt` }),
        providesTags: ['money'],
      }),
      listMessages: build.query<ListMessagesApiResponse, ListMessagesApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/messages`,
          params: {
            status: queryArg.status,
          },
        }),
        providesTags: ['messages'],
      }),
      getAttendanceSettings: build.query<
        GetAttendanceSettingsApiResponse,
        GetAttendanceSettingsApiArg
      >({
        query: () => ({ url: `/api/v1/attendance-settings` }),
        providesTags: ['attendance'],
      }),
      updateAttendanceSettings: build.mutation<
        UpdateAttendanceSettingsApiResponse,
        UpdateAttendanceSettingsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/v1/attendance-settings`,
          method: 'PUT',
          body: queryArg.attendanceSettings,
        }),
        invalidatesTags: ['attendance'],
      }),
      listMessageTemplates: build.query<
        ListMessageTemplatesApiResponse,
        ListMessageTemplatesApiArg
      >({
        query: () => ({ url: `/api/v1/message-templates` }),
        providesTags: ['messages'],
      }),
      updateMessageTemplate: build.mutation<
        UpdateMessageTemplateApiResponse,
        UpdateMessageTemplateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/v1/message-templates/${queryArg.trigger}`,
          method: 'PUT',
          body: queryArg.updateMessageTemplateRequest,
        }),
        invalidatesTags: ['messages'],
      }),
      getMessageSettings: build.query<GetMessageSettingsApiResponse, GetMessageSettingsApiArg>({
        query: () => ({ url: `/api/v1/message-settings` }),
        providesTags: ['messages'],
      }),
      updateMessageSettings: build.mutation<
        UpdateMessageSettingsApiResponse,
        UpdateMessageSettingsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/v1/message-settings`,
          method: 'PUT',
          body: queryArg.messageSettings,
        }),
        invalidatesTags: ['messages'],
      }),
      listFakePhoneMessages: build.query<
        ListFakePhoneMessagesApiResponse,
        ListFakePhoneMessagesApiArg
      >({
        query: () => ({ url: `/api/v1/dev/phone` }),
        providesTags: ['messages'],
      }),
      checkIn: build.mutation<CheckInApiResponse, CheckInApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/check-ins`,
          method: 'POST',
          body: queryArg.checkInRequest,
        }),
        invalidatesTags: ['attendance'],
      }),
      listStudents: build.query<ListStudentsApiResponse, ListStudentsApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/students`,
          params: {
            q: queryArg.q,
            groupId: queryArg.groupId,
            gradeLevelId: queryArg.gradeLevelId,
            owes: queryArg.owes,
          },
        }),
        providesTags: ['students'],
      }),
      createStudent: build.mutation<CreateStudentApiResponse, CreateStudentApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/students`,
          method: 'POST',
          body: queryArg.createStudentRequest,
        }),
        invalidatesTags: ['students'],
      }),
      getStudent: build.query<GetStudentApiResponse, GetStudentApiArg>({
        query: (queryArg) => ({ url: `/api/v1/students/${queryArg.id}` }),
        providesTags: ['students'],
      }),
      updateStudent: build.mutation<UpdateStudentApiResponse, UpdateStudentApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/students/${queryArg.id}`,
          method: 'PATCH',
          body: queryArg.updateStudentRequest,
        }),
        invalidatesTags: ['students'],
      }),
      listEnrollments: build.query<ListEnrollmentsApiResponse, ListEnrollmentsApiArg>({
        query: (queryArg) => ({ url: `/api/v1/students/${queryArg.id}/enrollments` }),
        providesTags: ['students'],
      }),
      createEnrollment: build.mutation<CreateEnrollmentApiResponse, CreateEnrollmentApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/students/${queryArg.id}/enrollments`,
          method: 'POST',
          body: queryArg.createEnrollmentRequest,
        }),
        invalidatesTags: ['students'],
      }),
      leaveEnrollment: build.mutation<LeaveEnrollmentApiResponse, LeaveEnrollmentApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/students/${queryArg.id}/enrollments/${queryArg.enrollmentId}`,
          method: 'DELETE',
        }),
        invalidatesTags: ['students'],
      }),
      createStudentInvite: build.mutation<
        CreateStudentInviteApiResponse,
        CreateStudentInviteApiArg
      >({
        query: (queryArg) => ({ url: `/api/v1/students/${queryArg.id}/invite`, method: 'POST' }),
        invalidatesTags: ['students'],
      }),
      resetStudentDevice: build.mutation<ResetStudentDeviceApiResponse, ResetStudentDeviceApiArg>({
        query: (queryArg) => ({ url: `/api/v1/students/${queryArg.id}/device`, method: 'DELETE' }),
        invalidatesTags: ['students'],
      }),
      getStudentInvitePreview: build.query<
        GetStudentInvitePreviewApiResponse,
        GetStudentInvitePreviewApiArg
      >({
        query: (queryArg) => ({ url: `/api/v1/student-invites/${queryArg.token}` }),
        providesTags: ['student-auth'],
      }),
      requestOtp: build.mutation<RequestOtpApiResponse, RequestOtpApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/auth/otp/request`,
          method: 'POST',
          body: queryArg.otpRequest,
        }),
        invalidatesTags: ['student-auth'],
      }),
      verifyOtp: build.mutation<VerifyOtpApiResponse, VerifyOtpApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/auth/otp/verify`,
          method: 'POST',
          body: queryArg.otpVerifyRequest,
        }),
        invalidatesTags: ['auth'],
      }),
      bindDevice: build.mutation<BindDeviceApiResponse, BindDeviceApiArg>({
        query: (queryArg) => ({
          url: `/api/v1/devices/bind`,
          method: 'POST',
          body: queryArg.bindDeviceRequest,
        }),
        invalidatesTags: ['student-auth'],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as api };
export type GetHealthApiResponse = /** status 200 The API is up */ HealthResponse;
export type GetHealthApiArg = void;
export type RegisterApiResponse = /** status 201 Signed in; sets the refresh cookie */ AuthResponse;
export type RegisterApiArg = {
  registerRequest: RegisterRequest;
};
export type LoginApiResponse = /** status 200 Signed in; sets the refresh cookie */ AuthResponse;
export type LoginApiArg = {
  loginRequest: LoginRequest;
};
export type RefreshApiResponse = /** status 200 Signed in; sets the refresh cookie */ AuthResponse;
export type RefreshApiArg = void;
export type LogoutApiResponse = unknown;
export type LogoutApiArg = void;
export type ForgotPasswordApiResponse = unknown;
export type ForgotPasswordApiArg = {
  forgotPasswordRequest: ForgotPasswordRequest;
};
export type ResetPasswordApiResponse = unknown;
export type ResetPasswordApiArg = {
  resetPasswordRequest: ResetPasswordRequest;
};
export type GetMeApiResponse = /** status 200 The signed-in user */ Me;
export type GetMeApiArg = void;
export type GetMyScheduleApiResponse = /** status 200 My sessions */ MySchedule;
export type GetMyScheduleApiArg = void;
export type GetMyAttendanceApiResponse = /** status 200 My attendance */ MyAttendance;
export type GetMyAttendanceApiArg = void;
export type GetMyGradesApiResponse = /** status 200 My grades */ MyGrades;
export type GetMyGradesApiArg = void;
export type CreateWorkspaceApiResponse =
  /** status 201 Created; the caller is its owner */ Workspace;
export type CreateWorkspaceApiArg = {
  createWorkspaceRequest: CreateWorkspaceRequest;
};
export type ListWorkspacesApiResponse = /** status 200 The caller's workspaces */ WorkspaceList;
export type ListWorkspacesApiArg = void;
export type GetCurrentWorkspaceApiResponse = /** status 200 The active workspace */ Workspace;
export type GetCurrentWorkspaceApiArg = void;
export type CreateInviteApiResponse =
  /** status 201 The invite; its token is shown only here */ Invite;
export type CreateInviteApiArg = {
  createInviteRequest: CreateInviteRequest;
};
export type ListInvitesApiResponse = /** status 200 Pending invites */ PendingInviteList;
export type ListInvitesApiArg = void;
export type RevokeInviteApiResponse = unknown;
export type RevokeInviteApiArg = {
  id: string;
};
export type GetInvitePreviewApiResponse =
  /** status 200 The inviting center and role */ InvitePreview;
export type GetInvitePreviewApiArg = {
  token: string;
};
export type CreateStaffResetLinkApiResponse =
  /** status 201 The link token, shown only here */ StaffResetLink;
export type CreateStaffResetLinkApiArg = {
  id: string;
};
export type AcceptInviteApiResponse = /** status 200 The joined workspace */ Workspace;
export type AcceptInviteApiArg = {
  token: string;
};
export type ListMembersApiResponse = /** status 200 Members of the active workspace */ MemberList;
export type ListMembersApiArg = void;
export type UpdateMemberApiResponse = /** status 200 Updated */ Member;
export type UpdateMemberApiArg = {
  id: string;
  updateMemberRequest: UpdateMemberRequest;
};
export type SetAssistantScopesApiResponse = unknown;
export type SetAssistantScopesApiArg = {
  id: string;
  setScopesRequest: SetScopesRequest;
};
export type ListSubjectsApiResponse = /** status 200 subjects */ CurriculumList;
export type ListSubjectsApiArg = void;
export type CreateSubjectApiResponse = /** status 201 Created */ CurriculumEntry;
export type CreateSubjectApiArg = {
  createCurriculumRequest: CreateCurriculumRequest;
};
export type ReorderSubjectsApiResponse = /** status 200 subjects */ CurriculumList;
export type ReorderSubjectsApiArg = {
  reorderCurriculumRequest: ReorderCurriculumRequest;
};
export type UpdateSubjectApiResponse = /** status 200 Updated */ CurriculumEntry;
export type UpdateSubjectApiArg = {
  id: string;
  updateCurriculumRequest: UpdateCurriculumRequest;
};
export type ListGradeLevelsApiResponse = /** status 200 grade levels */ CurriculumList;
export type ListGradeLevelsApiArg = void;
export type CreateGradeLevelApiResponse = /** status 201 Created */ CurriculumEntry;
export type CreateGradeLevelApiArg = {
  createCurriculumRequest: CreateCurriculumRequest;
};
export type ReorderGradeLevelsApiResponse = /** status 200 grade levels */ CurriculumList;
export type ReorderGradeLevelsApiArg = {
  reorderCurriculumRequest: ReorderCurriculumRequest;
};
export type UpdateGradeLevelApiResponse = /** status 200 Updated */ CurriculumEntry;
export type UpdateGradeLevelApiArg = {
  id: string;
  updateCurriculumRequest: UpdateCurriculumRequest;
};
export type ListRoomsApiResponse = /** status 200 Rooms */ RoomList;
export type ListRoomsApiArg = void;
export type CreateRoomApiResponse = /** status 201 Created */ Room;
export type CreateRoomApiArg = {
  createRoomRequest: CreateRoomRequest;
};
export type UpdateRoomApiResponse = /** status 200 Updated */ Room;
export type UpdateRoomApiArg = {
  id: string;
  updateRoomRequest: UpdateRoomRequest;
};
export type ListGroupsApiResponse = /** status 200 Groups the caller can see */ GroupList;
export type ListGroupsApiArg = void;
export type CreateGroupApiResponse = /** status 201 Created */ Group;
export type CreateGroupApiArg = {
  createGroupRequest: CreateGroupRequest;
};
export type GetGroupApiResponse = /** status 200 The group */ Group;
export type GetGroupApiArg = {
  id: string;
};
export type UpdateGroupApiResponse = /** status 200 Updated */ Group;
export type UpdateGroupApiArg = {
  id: string;
  updateGroupRequest: UpdateGroupRequest;
};
export type ListExamsApiResponse = /** status 200 Exams */ ExamList;
export type ListExamsApiArg = {
  id: string;
};
export type CreateExamApiResponse = /** status 201 Created */ Exam;
export type CreateExamApiArg = {
  id: string;
  createExamRequest: CreateExamRequest;
};
export type GetExamSheetApiResponse = /** status 200 The grade grid */ ExamSheet;
export type GetExamSheetApiArg = {
  id: string;
};
export type UpdateExamApiResponse = /** status 200 Updated */ Exam;
export type UpdateExamApiArg = {
  id: string;
  updateExamRequest: UpdateExamRequest;
};
export type DeleteExamApiResponse = unknown;
export type DeleteExamApiArg = {
  id: string;
};
export type SaveExamResultsApiResponse = /** status 200 Saved */ ExamSheet;
export type SaveExamResultsApiArg = {
  id: string;
  saveExamResultsRequest: SaveExamResultsRequest;
};
export type NotifyExamApiResponse = /** status 200 Queued */ NotifyExamResponse;
export type NotifyExamApiArg = {
  id: string;
};
export type ListSessionsApiResponse = /** status 200 Sessions the caller can see */ SessionList;
export type ListSessionsApiArg = {
  from: string;
  to: string;
};
export type MoveSessionApiResponse = /** status 200 Moved */ Session;
export type MoveSessionApiArg = {
  id: string;
  moveSessionRequest: MoveSessionRequest;
};
export type CancelSessionApiResponse = /** status 200 Cancelled */ Session;
export type CancelSessionApiArg = {
  id: string;
};
export type OpenSessionApiResponse = /** status 200 Open; draw the QR */ OpenSession;
export type OpenSessionApiArg = {
  id: string;
};
export type ListAttendanceApiResponse = /** status 200 Records so far */ AttendanceList;
export type ListAttendanceApiArg = {
  id: string;
};
export type GetTodayStatsApiResponse = /** status 200 Stats */ TodayStats;
export type GetTodayStatsApiArg = void;
export type GetTrendStatsApiResponse = /** status 200 Trends */ TrendStats;
export type GetTrendStatsApiArg = {
  weeks?: '8' | '13' | '26';
};
export type GetOwingStudentsApiResponse = /** status 200 Who owes */ OwingList;
export type GetOwingStudentsApiArg = void;
export type GetCollectionStatsApiResponse = /** status 200 Collected */ CollectionStats;
export type GetCollectionStatsApiArg = void;
export type GetCashSummaryApiResponse = /** status 200 Cash summary */ CashSummary;
export type GetCashSummaryApiArg = {
  date?: string;
};
export type GetSessionRosterApiResponse = /** status 200 Roster */ Roster;
export type GetSessionRosterApiArg = {
  id: string;
};
export type MarkAttendanceApiResponse = /** status 200 Recorded */ AttendanceRecord;
export type MarkAttendanceApiArg = {
  id: string;
  studentId: string;
  markAttendanceRequest: MarkAttendanceRequest;
};
export type CloseSessionApiResponse =
  /** status 200 Final attendance and the guardian messages queued */ CloseSessionResult;
export type CloseSessionApiArg = {
  id: string;
};
export type LiveAttendanceApiResponse = /** status 200 text/event-stream */ AttendanceRecord;
export type LiveAttendanceApiArg = {
  id: string;
};
export type GetStudentLedgerApiResponse = /** status 200 Ledger */ StudentLedger;
export type GetStudentLedgerApiArg = {
  id: string;
};
export type CreatePaymentApiResponse = /** status 201 Recorded */ LedgerEntry;
export type CreatePaymentApiArg = {
  'idempotency-key': string;
  createPaymentRequest: CreatePaymentRequest;
};
export type ReverseEntryApiResponse = /** status 201 The reversal */ LedgerEntry;
export type ReverseEntryApiArg = {
  id: string;
  'idempotency-key': string;
};
export type GetReceiptApiResponse = /** status 200 Receipt data */ Receipt;
export type GetReceiptApiArg = {
  id: string;
};
export type ListMessagesApiResponse = /** status 200 Messages */ OutboxMessageList;
export type ListMessagesApiArg = {
  status?: 'queued' | 'sent' | 'failed' | 'skipped';
};
export type GetAttendanceSettingsApiResponse = /** status 200 Settings */ AttendanceSettingsOutput;
export type GetAttendanceSettingsApiArg = void;
export type UpdateAttendanceSettingsApiResponse = /** status 200 Saved */ AttendanceSettingsOutput;
export type UpdateAttendanceSettingsApiArg = {
  attendanceSettings: AttendanceSettings;
};
export type ListMessageTemplatesApiResponse = /** status 200 Templates */ MessageTemplateList;
export type ListMessageTemplatesApiArg = void;
export type UpdateMessageTemplateApiResponse = /** status 200 Saved */ MessageTemplate;
export type UpdateMessageTemplateApiArg = {
  trigger: 'absence' | 'session_cancelled' | 'session_moved' | 'exam_result' | 'fee_overdue';
  updateMessageTemplateRequest: UpdateMessageTemplateRequest;
};
export type GetMessageSettingsApiResponse = /** status 200 Settings */ MessageSettingsOutput;
export type GetMessageSettingsApiArg = void;
export type UpdateMessageSettingsApiResponse = /** status 200 Settings */ MessageSettingsOutput;
export type UpdateMessageSettingsApiArg = {
  messageSettings: MessageSettings;
};
export type ListFakePhoneMessagesApiResponse = /** status 200 Sent messages */ SentMessageList;
export type ListFakePhoneMessagesApiArg = void;
export type CheckInApiResponse = /** status 200 Checked in */ CheckIn;
export type CheckInApiArg = {
  checkInRequest: CheckInRequest;
};
export type ListStudentsApiResponse = /** status 200 Students */ StudentList;
export type ListStudentsApiArg = {
  q?: string;
  groupId?: string;
  gradeLevelId?: string;
  owes?: 'true';
};
export type CreateStudentApiResponse = /** status 201 Created */ Student;
export type CreateStudentApiArg = {
  createStudentRequest: CreateStudentRequest;
};
export type GetStudentApiResponse = /** status 200 The student */ Student;
export type GetStudentApiArg = {
  id: string;
};
export type UpdateStudentApiResponse = /** status 200 Updated */ Student;
export type UpdateStudentApiArg = {
  id: string;
  updateStudentRequest: UpdateStudentRequest;
};
export type ListEnrollmentsApiResponse = /** status 200 Enrollments */ EnrollmentList;
export type ListEnrollmentsApiArg = {
  id: string;
};
export type CreateEnrollmentApiResponse = /** status 201 Enrolled */ Enrollment;
export type CreateEnrollmentApiArg = {
  id: string;
  createEnrollmentRequest: CreateEnrollmentRequest;
};
export type LeaveEnrollmentApiResponse = /** status 200 Left */ Enrollment;
export type LeaveEnrollmentApiArg = {
  id: string;
  enrollmentId: string;
};
export type CreateStudentInviteApiResponse =
  /** status 201 The token is shown only here */ StudentInvite;
export type CreateStudentInviteApiArg = {
  id: string;
};
export type ResetStudentDeviceApiResponse = unknown;
export type ResetStudentDeviceApiArg = {
  id: string;
};
export type GetStudentInvitePreviewApiResponse =
  /** status 200 The student and the center */ StudentInvitePreview;
export type GetStudentInvitePreviewApiArg = {
  token: string;
};
export type RequestOtpApiResponse = unknown;
export type RequestOtpApiArg = {
  otpRequest: OtpRequest;
};
export type VerifyOtpApiResponse =
  /** status 200 Signed in; sets the refresh cookie */ AuthResponse;
export type VerifyOtpApiArg = {
  otpVerifyRequest: OtpVerifyRequest;
};
export type BindDeviceApiResponse = /** status 201 Bound */ Device;
export type BindDeviceApiArg = {
  bindDeviceRequest: BindDeviceRequest;
};
export type HealthResponse = {
  status: 'ok';
};
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INVALID_CREDENTIALS'
  | 'PHONE_TAKEN'
  | 'EMAIL_TAKEN'
  | 'WORKSPACE_NOT_FOUND'
  | 'INVITE_INVALID'
  | 'RESET_INVALID'
  | 'RESET_NOT_ALLOWED'
  | 'ALREADY_MEMBER'
  | 'MEMBER_NOT_ASSISTANT'
  | 'LAST_OWNER'
  | 'MEMBER_TEACHES_GROUPS'
  | 'SCOPE_TEACHER_INVALID'
  | 'GROUP_NOT_FOUND'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_NAME_TAKEN'
  | 'ROOM_BOOKED'
  | 'CURRICULUM_ITEM_NOT_FOUND'
  | 'CURRICULUM_NAME_TAKEN'
  | 'CURRICULUM_ORDER_STALE'
  | 'GROUP_REFERENCE_INVALID'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_SCHEDULED'
  | 'SESSION_TOO_EARLY'
  | 'SESSION_TIME_INVALID'
  | 'TEACHER_BOOKED'
  | 'STUDENT_NOT_FOUND'
  | 'STUDENT_REFERENCE_INVALID'
  | 'OTP_INVALID'
  | 'STUDENT_ALREADY_ACTIVATED'
  | 'DEVICE_ALREADY_BOUND'
  | 'DEVICE_KEY_INVALID'
  | 'ENROLLMENT_EXISTS'
  | 'GROUP_FULL'
  | 'ENROLLMENT_NOT_FOUND'
  | 'SESSION_NOT_OPEN'
  | 'CHECKIN_CODE_INVALID'
  | 'CHECKIN_CODE_EXPIRED'
  | 'DEVICE_NOT_BOUND'
  | 'DEVICE_SIGNATURE_INVALID'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'ENTRY_NOT_FOUND'
  | 'ENTRY_ALREADY_REVERSED'
  | 'ENTRY_NOT_REVERSIBLE'
  | 'EXAM_NOT_FOUND'
  | 'EXAM_SCORE_ABOVE_MAX'
  | 'TEMPLATE_PLACEHOLDER_UNKNOWN'
  | 'EXAM_STUDENT_INVALID'
  | 'EXAM_HAS_RESULTS'
  | 'EXAM_NOT_GRADED'
  | 'INTERNAL';
export type ErrorResponse = {
  code: ErrorCode;
  details?: {
    [key: string]: any;
  };
};
export type Me = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  locale: 'ar' | 'en';
  kind: 'staff' | 'student';
};
export type AuthResponse = {
  accessToken: string;
  user: Me;
};
export type RegisterRequest = {
  name: string;
  phone?: string;
  email?: string;
  password: string;
  locale?: 'ar' | 'en';
};
export type LoginRequest = {
  login: string;
  password: string;
};
export type ForgotPasswordRequest = {
  email: string;
};
export type ResetPasswordRequest = {
  token: string;
  password: string;
};
export type CurriculumItem = {
  id: string;
  nameAr: string;
  nameEn: string;
};
export type MySession = {
  id: string;
  center: {
    nameAr: string;
    nameEn: string | null;
  };
  subject: CurriculumItem;
  gradeLevel: CurriculumItem;
  groupLabel: string | null;
  teacherName: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'open' | 'closed' | 'cancelled';
  timezone: string;
};
export type MySchedule = MySession[];
export type MyAttendanceRecord = {
  sessionId: string;
  center: {
    nameAr: string;
    nameEn: string | null;
  };
  subject: CurriculumItem;
  startsAt: string;
  timezone: string;
  status: 'present' | 'late' | 'absent' | 'excused' | 'makeup';
};
export type MyAttendance = MyAttendanceRecord[];
export type MyGrade = {
  examId: string;
  center: {
    nameAr: string;
    nameEn: string | null;
  };
  subject: CurriculumItem;
  title: string;
  heldOn: string;
  maxScore: number;
  score: number | null;
  absent: boolean;
};
export type MyGrades = MyGrade[];
export type Workspace = {
  id: string;
  type: 'center' | 'independent';
  nameAr: string;
  nameEn: string | null;
  timezone: string;
  role: 'owner' | 'teacher' | 'assistant';
};
export type CreateWorkspaceRequest = {
  type: 'center' | 'independent';
  nameAr: string;
  nameEn?: string;
};
export type WorkspaceList = Workspace[];
export type Invite = {
  id: string;
  role: 'teacher' | 'assistant';
  token: string;
  expiresAt: string;
  teacherMembershipIds: string[];
};
export type CreateInviteRequest = {
  role: 'teacher' | 'assistant';
  teacherMembershipIds?: string[];
};
export type PendingInvite = {
  id: string;
  role: 'teacher' | 'assistant';
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
};
export type PendingInviteList = PendingInvite[];
export type InvitePreview = {
  workspaceNameAr: string;
  workspaceNameEn: string | null;
  workspaceType: 'center' | 'independent';
  role: 'teacher' | 'assistant';
};
export type StaffResetLink = {
  token: string;
  expiresAt: string;
};
export type Member = {
  id: string;
  userId: string;
  name: string;
  phone: string | null;
  role: 'owner' | 'teacher' | 'assistant';
  status: 'active' | 'removed';
  teacherMembershipIds: string[];
};
export type MemberList = Member[];
export type UpdateMemberRequest = {
  role?: 'owner' | 'teacher' | 'assistant';
  status?: 'removed';
};
export type SetScopesRequest = {
  teacherMembershipIds: string[];
};
export type CurriculumEntry = {
  id: string;
  nameAr: string;
  nameEn: string;
  status: 'active' | 'archived';
};
export type CurriculumList = CurriculumEntry[];
export type CreateCurriculumRequest = {
  nameAr: string;
  nameEn?: string;
};
export type ReorderCurriculumRequest = {
  ids: string[];
};
export type UpdateCurriculumRequest = {
  nameAr?: string;
  nameEn?: string;
  status?: 'active' | 'archived';
};
export type Room = {
  id: string;
  name: string;
  capacity: number | null;
  status: 'active' | 'archived';
};
export type RoomList = Room[];
export type CreateRoomRequest = {
  name: string;
  capacity?: number | null;
};
export type UpdateRoomRequest = {
  name?: string;
  capacity?: number | null;
  status?: 'active' | 'archived';
};
export type RoomRef = {
  id: string;
  name: string;
};
export type GroupSlotOutput = {
  weekday: number;
  startTime: string;
  endTime: string;
};
export type Group = {
  id: string;
  teacherMembershipId: string;
  teacherName: string;
  teacherRemoved: boolean;
  subject: CurriculumItem;
  gradeLevel: CurriculumItem;
  label: string | null;
  capacity: number | null;
  monthlyFeePiastres: number | null;
  room: RoomRef | null;
  status: 'active' | 'archived';
  slots: GroupSlotOutput[];
  studentCount: number;
};
export type GroupList = Group[];
export type GroupSlot = {
  weekday: number;
  startTime: string;
  endTime: string;
};
export type CreateGroupRequest = {
  teacherMembershipId?: string;
  subjectId: string;
  gradeLevelId: string;
  label?: string | null;
  capacity?: number | null;
  monthlyFeePiastres?: number | null;
  roomId?: string | null;
  slots: GroupSlot[];
  force?: boolean;
};
export type UpdateGroupRequest = {
  teacherMembershipId?: string;
  subjectId?: string;
  gradeLevelId?: string;
  label?: string | null;
  capacity?: number | null;
  monthlyFeePiastres?: number | null;
  roomId?: string | null;
  status?: 'active' | 'archived';
  slots?: GroupSlot[];
  force?: boolean;
};
export type Exam = {
  id: string;
  groupId: string;
  title: string;
  heldOn: string;
  maxScore: number;
  graded: number;
  absent: number;
  average: number | null;
  notifiedAt: string | null;
};
export type ExamList = Exam[];
export type CreateExamRequest = {
  title: string;
  heldOn: string;
  maxScore: number;
};
export type ExamSheetRow = {
  studentId: string;
  nameAr: string;
  nameEn: string | null;
  score: number | null;
  absent: boolean;
};
export type ExamSheet = {
  exam: Exam;
  subject: CurriculumItem;
  groupLabel: string | null;
  rows: ExamSheetRow[];
};
export type UpdateExamRequest = {
  title?: string;
  heldOn?: string;
  maxScore?: number;
};
export type SaveExamResultsRequest = {
  results: {
    studentId: string;
    score: number | null;
    absent: boolean;
  }[];
};
export type NotifyExamResponse = {
  queued: number;
};
export type Session = {
  id: string;
  groupId: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'open' | 'closed' | 'cancelled';
  moved: boolean;
  teacherMembershipId: string;
  teacherName: string;
  subject: CurriculumItem;
  gradeLevel: CurriculumItem;
  groupLabel: string | null;
  room: RoomRef | null;
};
export type SessionList = Session[];
export type MoveSessionRequest = {
  date: string;
  startTime: string;
  endTime: string;
  force?: boolean;
  roomId?: string | null;
};
export type OpenSession = {
  sessionId: string;
  qrKey: string;
  serverTime: string;
  windowMs: number;
};
export type AttendanceRecord = {
  id: string;
  studentId: string;
  nameAr: string;
  nameEn: string | null;
  status: 'present' | 'late' | 'absent' | 'excused' | 'makeup';
  method: 'student_scan' | 'manual' | 'auto_close';
  recordedAt: string;
};
export type AttendanceList = AttendanceRecord[];
export type StatsDay = {
  date: string;
  present: number;
  total: number;
};
export type TodayStats = {
  sessionsToday: number;
  expectedToday: number;
  checkedInToday: number;
  activeStudents: number;
  week: StatsDay[];
};
export type WeekCount = {
  present: number;
  total: number;
};
export type ExamPoint = {
  id: string;
  title: string;
  heldOn: string;
  averagePct: number | null;
};
export type GroupTrend = {
  id: string;
  subject: CurriculumItem;
  gradeLevel: CurriculumItem;
  label: string | null;
  teacherName: string;
  attendance: WeekCount[];
  exams: ExamPoint[];
};
export type MonthTotals = {
  cash: number;
  vodafone_cash: number;
  instapay: number;
  total: number;
  month: string;
};
export type TrendStats = {
  weeks: string[];
  groups: GroupTrend[];
  money: MonthTotals[] | null;
};
export type OwingStudent = {
  id: string;
  nameAr: string;
  nameEn: string | null;
  gradeLevel: CurriculumItem;
  balancePiastres: number;
};
export type OwingList = OwingStudent[];
export type MethodTotals = {
  cash: number;
  vodafone_cash: number;
  instapay: number;
  total: number;
};
export type CollectionStats = {
  today: MethodTotals;
  month: MethodTotals;
};
export type CashEntry = {
  id: string;
  kind: 'payment' | 'reversal';
  receiptNo: number;
  studentName: string;
  amountPiastres: number;
  method: 'cash' | 'vodafone_cash' | 'instapay';
  createdAt: string;
};
export type StaffCash = {
  userId: string;
  name: string;
  totals: MethodTotals;
  entries: CashEntry[];
};
export type CashSummary = {
  date: string;
  timezone: string;
  center: {
    nameAr: string;
    nameEn: string | null;
  };
  staff: StaffCash[];
};
export type RosterEntry = {
  studentId: string;
  nameAr: string;
  nameEn: string | null;
};
export type Roster = RosterEntry[];
export type MarkAttendanceRequest = {
  status: 'present' | 'late' | 'absent' | 'excused' | 'makeup';
};
export type CloseSessionResult = {
  records: AttendanceList;
  messagesQueued: number;
};
export type LedgerEntry = {
  id: string;
  type: 'charge' | 'payment' | 'reversal';
  amountPiastres: number;
  method: ('cash' | 'vodafone_cash' | 'instapay') | null;
  receiptNo: number | null;
  period: string | null;
  groupId: string;
  subject: CurriculumItem;
  reversesEntryId: string | null;
  reversedById: string | null;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
};
export type StudentLedger = {
  balancePiastres: number;
  entries: LedgerEntry[];
};
export type CreatePaymentRequest = {
  studentId: string;
  groupId: string;
  amountPiastres: number;
  method: 'cash' | 'vodafone_cash' | 'instapay';
  note?: string;
};
export type Receipt = {
  entry: LedgerEntry;
  studentName: string;
  center: {
    nameAr: string;
    nameEn: string | null;
  };
  timezone: string;
};
export type OutboxMessage = {
  id: string;
  trigger: 'absence' | 'session_cancelled' | 'session_moved' | 'exam_result' | 'fee_overdue';
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  phone: string;
  guardianName: string | null;
  students: string[];
  locale: ('ar' | 'en') | null;
  attempts: number;
  sendAfter: string;
  sentAt: string | null;
  body: string | null;
  lastError: string | null;
  skipReason: ('paid' | 'trigger_off' | 'not_absent') | null;
  createdAt: string;
};
export type OutboxMessageList = OutboxMessage[];
export type AttendanceSettingsOutput = {
  lateAfterMinutes: number;
};
export type AttendanceSettings = {
  lateAfterMinutes: number;
};
export type MessageTemplate = {
  trigger: 'absence' | 'session_cancelled' | 'session_moved' | 'exam_result' | 'fee_overdue';
  placeholders: string[];
  ar: {
    default: string;
    custom: string | null;
  };
  en: {
    default: string;
    custom: string | null;
  };
};
export type MessageTemplateList = MessageTemplate[];
export type UpdateMessageTemplateRequest = {
  ar: string | null;
  en: string | null;
};
export type MessageSettingsOutput = {
  absence: boolean;
  sessionChange: boolean;
  examResult: boolean;
  feeOverdue: boolean;
};
export type MessageSettings = {
  absence: boolean;
  sessionChange: boolean;
  examResult: boolean;
  feeOverdue: boolean;
};
export type SentMessage = {
  id: string;
  phone: string;
  guardianName: string | null;
  locale: 'ar' | 'en';
  body: string;
  sentAt: string;
};
export type SentMessageList = SentMessage[];
export type CheckIn = {
  id: string;
  sessionId: string;
  status: 'present' | 'late' | 'absent' | 'excused' | 'makeup';
  recordedAt: string;
};
export type CheckInRequest = {
  code: string;
  signature: string;
};
export type Guardian = {
  id: string;
  name: string | null;
  phone: string;
  relation: 'father' | 'mother' | 'other';
  preferredLocale: 'ar' | 'en';
  whatsappOptIn: boolean;
  isPrimary: boolean;
};
export type Student = {
  id: string;
  nameAr: string;
  nameEn: string | null;
  phone: string | null;
  gradeLevel: CurriculumItem;
  school: string | null;
  status: 'active' | 'archived';
  guardians: Guardian[];
  primaryGuardianOnly: boolean;
  activated: boolean;
  deviceBound: boolean;
  balancePiastres: number;
};
export type StudentList = Student[];
export type GuardianInput = {
  phone: string;
  name?: string;
  relation: 'father' | 'mother' | 'other';
  preferredLocale: 'ar' | 'en';
  whatsappOptIn: boolean;
};
export type CreateStudentRequest = {
  nameAr: string;
  nameEn?: string;
  phone?: string;
  gradeLevelId: string;
  school?: string;
  guardian: GuardianInput;
  extraGuardians?: GuardianInput[];
  primaryGuardianOnly?: boolean;
};
export type UpdateStudentRequest = {
  nameAr?: string;
  nameEn?: string | null;
  phone?: string | null;
  gradeLevelId?: string;
  school?: string | null;
  status?: 'active' | 'archived';
  guardian?: GuardianInput;
  extraGuardians?: GuardianInput[];
  primaryGuardianOnly?: boolean;
};
export type Enrollment = {
  id: string;
  groupId: string;
  subject: CurriculumItem;
  gradeLevel: CurriculumItem;
  teacherName: string;
  discountPct: number;
  status: 'active' | 'left';
  joinedAt: string;
  leftAt: string | null;
};
export type EnrollmentList = Enrollment[];
export type CreateEnrollmentRequest = {
  groupId: string;
  discountPct?: number;
  force?: boolean;
};
export type StudentInvite = {
  token: string;
  expiresAt: string;
};
export type StudentInvitePreview = {
  studentFirstNameAr: string;
  studentFirstNameEn: string | null;
  workspaceNameAr: string;
  workspaceNameEn: string | null;
};
export type OtpRequest = {
  email: string;
  inviteToken?: string;
};
export type OtpVerifyRequest = {
  email: string;
  code: string;
  inviteToken?: string;
};
export type Device = {
  id: string;
  boundAt: string;
};
export type BindDeviceRequest = {
  publicKey: string;
  label?: string;
};
export const {
  useGetHealthQuery,
  useRegisterMutation,
  useLoginMutation,
  useRefreshMutation,
  useLogoutMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useGetMeQuery,
  useGetMyScheduleQuery,
  useGetMyAttendanceQuery,
  useGetMyGradesQuery,
  useCreateWorkspaceMutation,
  useListWorkspacesQuery,
  useGetCurrentWorkspaceQuery,
  useCreateInviteMutation,
  useListInvitesQuery,
  useRevokeInviteMutation,
  useGetInvitePreviewQuery,
  useCreateStaffResetLinkMutation,
  useAcceptInviteMutation,
  useListMembersQuery,
  useUpdateMemberMutation,
  useSetAssistantScopesMutation,
  useListSubjectsQuery,
  useCreateSubjectMutation,
  useReorderSubjectsMutation,
  useUpdateSubjectMutation,
  useListGradeLevelsQuery,
  useCreateGradeLevelMutation,
  useReorderGradeLevelsMutation,
  useUpdateGradeLevelMutation,
  useListRoomsQuery,
  useCreateRoomMutation,
  useUpdateRoomMutation,
  useListGroupsQuery,
  useCreateGroupMutation,
  useGetGroupQuery,
  useUpdateGroupMutation,
  useListExamsQuery,
  useCreateExamMutation,
  useGetExamSheetQuery,
  useUpdateExamMutation,
  useDeleteExamMutation,
  useSaveExamResultsMutation,
  useNotifyExamMutation,
  useListSessionsQuery,
  useMoveSessionMutation,
  useCancelSessionMutation,
  useOpenSessionMutation,
  useListAttendanceQuery,
  useGetTodayStatsQuery,
  useGetTrendStatsQuery,
  useGetOwingStudentsQuery,
  useGetCollectionStatsQuery,
  useGetCashSummaryQuery,
  useGetSessionRosterQuery,
  useMarkAttendanceMutation,
  useCloseSessionMutation,
  useLiveAttendanceQuery,
  useGetStudentLedgerQuery,
  useCreatePaymentMutation,
  useReverseEntryMutation,
  useGetReceiptQuery,
  useListMessagesQuery,
  useGetAttendanceSettingsQuery,
  useUpdateAttendanceSettingsMutation,
  useListMessageTemplatesQuery,
  useUpdateMessageTemplateMutation,
  useGetMessageSettingsQuery,
  useUpdateMessageSettingsMutation,
  useListFakePhoneMessagesQuery,
  useCheckInMutation,
  useListStudentsQuery,
  useCreateStudentMutation,
  useGetStudentQuery,
  useUpdateStudentMutation,
  useListEnrollmentsQuery,
  useCreateEnrollmentMutation,
  useLeaveEnrollmentMutation,
  useCreateStudentInviteMutation,
  useResetStudentDeviceMutation,
  useGetStudentInvitePreviewQuery,
  useRequestOtpMutation,
  useVerifyOtpMutation,
  useBindDeviceMutation,
} = injectedRtkApi;
