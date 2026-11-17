//go:build unit

package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAdminGroupAccountIntelligenceCreate(t *testing.T) {
	for _, platform := range []string{PlatformOpenAI, PlatformComposite, PlatformAnthropic} {
		t.Run(platform, func(t *testing.T) {
			repo := &groupRepoStubForAdmin{}
			svc := &adminServiceImpl{groupRepo: repo}
			_, err := svc.CreateGroup(context.Background(), &CreateGroupInput{
				Name: "intelligence", Platform: platform, RateMultiplier: 1, AccountIntelligenceEnabled: true,
			})
			require.NoError(t, err)
			require.Equal(t, platform == PlatformOpenAI, repo.created.AccountIntelligenceEnabled)
		})
	}
}

func TestAdminGroupAccountIntelligenceUpdate(t *testing.T) {
	for _, tc := range []struct {
		name    string
		initial bool
		input   UpdateGroupInput
		want    bool
	}{
		{name: "enable", input: UpdateGroupInput{AccountIntelligenceEnabled: boolPtr(true)}, want: true},
		{name: "disable", initial: true, input: UpdateGroupInput{AccountIntelligenceEnabled: boolPtr(false)}},
		{name: "omitted preserves enabled", initial: true, want: true},
		{name: "platform change clears enabled", initial: true, input: UpdateGroupInput{Platform: PlatformAnthropic}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo := &groupRepoStubForAdmin{getByID: &Group{
				ID: 1, Name: "intelligence", Platform: PlatformOpenAI, Status: StatusActive,
				AccountIntelligenceEnabled: tc.initial,
			}}
			svc := &adminServiceImpl{groupRepo: repo}
			_, err := svc.UpdateGroup(context.Background(), 1, &tc.input)
			require.NoError(t, err)
			require.Equal(t, tc.want, repo.updated.AccountIntelligenceEnabled)
		})
	}
}
